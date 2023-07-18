import { web3Url } from './web3-url';
import { htmlProcessor, looksLikeHTML } from './html-processor';
import { initScript } from './init-script';
import { getDeclarativeNetRequestRules, getAllPastDeclarativeNetRequestRuleIds } from './declarative-net-request-rules';
const { parseUrl, fetchParsedUrl, fetchUrl } = require('web3protocol');
const { Base64 } = require('js-base64');

// Returns whether development mode is enabled.
// When it is enabled, extra logging is done to the console.
function developmentMode() {
	return true;
}

// Represents a request made to the extension.
interface extRequest {
	// The underlying chrome-extension:// request being made to the extension.
	request: Request;
	// The rewritten URL that we are serving.
	url: string;
}

// The result of resolving the "domain" component of an ERC-4804 address.
interface web3UrlNameResolution {
	chainId: number;
	resolvedName: string;
}

// An origin for a ERC-4804 URL.
interface web3Origin {
	nameResolution: web3UrlNameResolution;
	contractAddress: string;
	chainId: number;
}

// The result of fetching a ERC-4804 URL.
interface web3FetchResult {
	output: Uint8Array;
	mimeType?: string;
	parsedUrl: web3Origin;
}

// Accepted types that can be served back to the user.
type httpBody = string | Uint8Array | Blob | ReadableStream;

// A function that processes an HTTP response body.
type bodyProcessor = (body: string) => string;

// A key-value dictionary of HTTP headers.
// Keys are case-insensitive.
interface httpHeaders {
	[key: string]: string
}

// Constants.
const chromeExtensionPrefix = chrome.runtime.getURL('/');
const chromeExtensionPrefixLength = chromeExtensionPrefix.length;
const web3Scheme = 'web3://';
const web3ScriptUrlScheme = 'web3scripturl://';
const web3ScriptInlineScheme = 'web3scriptinline://';
const web3ScriptInitScheme = 'web3scriptinit://';
const web3DevNullScheme = 'web3devnull://';
const httpScheme = 'http://';
const httpsScheme = 'https://';

// Creates an HTTP Response object with the given body, response code, and HTTP headers.
function makeResponse(body: httpBody, responseCode: number, headers: httpHeaders): Response {
	let responseOptions: ResponseInit = {
		'status': responseCode,
		'headers': {
			'cache-control': 'max-age=1800',
			'content-security-policy': "default-src * self blob: data: gap:; style-src * self 'unsafe-inline' blob: data: gap:; script-src * 'self' 'unsafe-eval' 'unsafe-inline' blob: data: gap:; object-src * 'self' blob: data: gap:; img-src * self 'unsafe-inline' blob: data: gap:; connect-src self * 'unsafe-inline' blob: data: gap:; frame-src * self blob: data: gap:; worker-src * self blob: data: gap:;",
			'content-type': 'application/octet-stream',
		},
	};
	for (let i in headers) {
		responseOptions['headers'][i.toLowerCase()] = headers[i];
	}
	if ((body instanceof Uint8Array) || (typeof(body) == 'string')) {
		return new Response(new Blob([body]), responseOptions);
	}
	return new Response(body, responseOptions);
}

// Create an HTTP Response object representing the content of the passed-in web3Promise.
// forceMime may be used to override the mime-type returned in the response.
// If the web3 request is successful, the list of processors will be run over the
// response body.
async function makeWeb3Response(web3Promise: Promise<web3FetchResult>, forceMime: string, processors: bodyProcessor[]): Promise<Response> {
	try {
		const result = await web3Promise;
		let mimeType = result.mimeType;
		if (forceMime !== null) {
			mimeType = forceMime;
		}
		let body = result.output;
		if (processors != null) {
			let stringBody = String(body);
			for (let processor of processors) {
				stringBody = processor(stringBody);
			}
			body = new TextEncoder().encode(stringBody);
		}
		let headers = {};
		if (mimeType !== null && mimeType != '') {
			headers['content-type'] = mimeType;
		}
		return makeResponse(body, 200, headers);
	} catch (e) {
		if (developmentMode()) {
			throw e;
		}
		let errorMessage = String(e);
		if (e instanceof Error) {
			errorMessage = e.message;
		}
		return makeResponse(errorMessage, 502, {
			'content-type': 'text/plain',
		});
	}
}

// Serves an extension request for the web3:// URL scheme.
async function serveWeb3Request(w3url: web3Url): Promise<Response> {
	const web3Promise = fetchUrl(w3url.toString());
	let result: web3FetchResult;
	try {
		result = await web3Promise;
	} catch (e) {
		if (developmentMode()) {
			console.log('Failed to fetch', w3url, ':', e);
			throw e;
		}
		return makeWeb3Response(web3Promise, 'text/plain', null);
	}
	if (result.mimeType == 'text/html' || result.mimeType == 'application/xhtml+xml' || looksLikeHTML(String(result.output))) {
		let processor = new htmlProcessor(w3url);
		return makeWeb3Response(web3Promise, 'text/html', [processor.processHtml]);
	} else {
		return makeWeb3Response(web3Promise, null, null);
	}
}

// Serves an extension request for the web3scripturl:// URL scheme.
async function serveWeb3ScriptURLRequest(extReq: extRequest): Promise<Response> {
	const encodedUrl = extReq.url.substring(web3ScriptUrlScheme.length);
	const decodedUrl = Base64.decode(encodedUrl);
	let w3url: web3Url = null;
	try {
		w3url = new web3Url(decodedUrl);
	} catch (e) {
		// Do nothing.
	}
	if (w3url !== null) {
		if (developmentMode()) {
			console.log('Serving script URL request:', decodedUrl, 'decoded to', w3url);
		}
		return makeWeb3Response(fetchUrl(w3url.toString()), 'text/javascript', null);
	}
	if (!decodedUrl.startsWith(httpsScheme) && !decodedUrl.startsWith(httpScheme)) {
		if (developmentMode()) {
			console.log('Got invalid URL: encoded=', encodedUrl, '; decoded=', decodedUrl);
		}
		return makeResponse('invalid URL: ' + encodedUrl, 501, {
			'content-type': 'text-plain',
		});
	}
	if (developmentMode()) {
		console.log('Serving HTTP script URL request:', decodedUrl);
	}
	const scriptRequest = fetch(decodedUrl, {
		'method': 'GET',
		'mode': 'cors',
		'redirect': 'follow',
	});
	let result: Response;
	let scriptBody: string;
	try {
		result = await scriptRequest;
		scriptBody = await result.text();
	} catch (e) {
		if (developmentMode()) {
			// For development purposes:
			throw e;
		}
		let errorMessage = String(e);
		if (e instanceof Error) {
			errorMessage = e.message;
		}
		return makeResponse(errorMessage, 502, {
			'content-type': 'text/plain',
		});
	}
	return makeResponse(scriptBody, result.status, {
		'content-type': 'text/javascript',
	});
}

// Serves an extension request for the web3scriptinline:// URL scheme.
async function serveWeb3ScriptInlineRequest(extReq: extRequest): Promise<Response> {
	const encodedScript = extReq.url.substring(web3ScriptInlineScheme.length);
	const decodedScript = Base64.decode(encodedScript);
	return makeResponse(decodedScript, 200, {
		'content-type': 'text/javascript',
	});
}

// Serves an extension request for the web3scriptinit:// URL scheme.
async function serveWeb3ScriptInitRequest(extReq: extRequest): Promise<Response> {
	const encodedUrl = extReq.url.substring(web3ScriptInitScheme.length);
	const decodedUrl = Base64.decode(encodedUrl);
	const w3url = new web3Url(decodedUrl);
	return makeResponse(new initScript(w3url).render(), 200, {
		'content-type': 'text/javascript',
	});
}

// Serves an extension request for the web3devnull:// URL scheme.
async function serveWeb3DevNullRequest(extReq: extRequest): Promise<Response> {
	const maybeMimeType = extReq.url.substring(web3DevNullScheme.length);
	let headers = {};
	if (maybeMimeType !== '') {
		headers['content-type'] = maybeMimeType;
	}
	return makeResponse('', 200, headers);
}

// Main request entry point.
// Serves a request made to the extension service worker.
async function handleRequest(request: Request): Promise<Response> {
	let url = request.url;
	if (url.startsWith(chromeExtensionPrefix)) {
		url = request.url.substring(chromeExtensionPrefixLength);
	}
	let poundIndex = url.indexOf('#');
	if (poundIndex !== -1) {
		url = url.substring(0, poundIndex);
	}
	const extReq: extRequest = {
		request: request,
		url: url,
	};
	console.log('Fetching URL:', url);
	if (url.startsWith(web3ScriptUrlScheme)) {
		return serveWeb3ScriptURLRequest(extReq);
	} else if (url.startsWith(web3ScriptInlineScheme)) {
		return serveWeb3ScriptInlineRequest(extReq);
	} else if (url.startsWith(web3ScriptInitScheme)) {
		return serveWeb3ScriptInitRequest(extReq);
	} else if (url.startsWith(web3DevNullScheme)) {
		return serveWeb3DevNullRequest(extReq);
	} else {
		let w3url: web3Url;
		try {
			w3url = new web3Url(extReq.url);
		} catch (e) {
			return makeResponse('invalid request', 400, {});
		}
		return serveWeb3Request(w3url);
	}
}

// Handle fetch event in the extension service worker.
self.addEventListener('fetch', (event: FetchEvent) => {
	event.respondWith(handleRequest(event.request));
});

// Handle omnibox input events to support the "web3" omnibox keyword.
chrome.omnibox.onInputEntered.addListener((text, disposition) => {
	if (text.startsWith('web3://')) {
		text = text.substring('web3://'.length);
	}
	if (text.startsWith('://')) {
		text = text.substring('://'.length);
	}
	while (text.startsWith('/')) {
		text = text.substring('/'.length);
	}
	let url = chromeExtensionPrefix + web3Scheme + text;
	if (disposition == 'currentTab') {
		chrome.tabs.update({
			url: url,
		});
	} else {
		chrome.tabs.create({
			active: disposition != 'newForegroundTab',
			url: url,
		});
	}
});

// Set declarativeNetRequest redirect rules for the extension.
chrome.declarativeNetRequest.updateDynamicRules({
	removeRuleIds: getAllPastDeclarativeNetRequestRuleIds(),
	addRules: getDeclarativeNetRequestRules(),
});
