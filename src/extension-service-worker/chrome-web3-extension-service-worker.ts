const { parseUrl, fetchParsedUrl, fetchUrl } = require('web3protocol');
const { Base64 } = require('js-base64');

interface extRequest {
	request: Request;
	url: string;
}

interface web3UrlNameResolution {
	chainId: number;
	resolvedName: string;
}

interface web3Url {
	nameResolution: web3UrlNameResolution;
	contractAddress: string;
	chainId: number;
}

interface web3FetchResult {
	output: Uint8Array;
	mimeType?: string;
	parsedUrl: web3Url;
}

type httpBody = string | Uint8Array | Blob | ReadableStream;

type web3BodyProcessor = (origin: web3Url, body: string) => string;

interface httpHeaders {
	[key: string]: string
}

function developmentMode() {
	return true;
}

const chromeExtensionPrefix = chrome.runtime.getURL('/');
const chromeExtensionPrefixLength = chromeExtensionPrefix.length;
const web3Scheme = 'web3://';
const web3ScriptUrlScheme = 'web3scripturl://';
const web3ScriptInlineScheme = 'web3scriptinline://';
const httpScheme = 'http://';
const httpsScheme = 'https://';
const rewritableUrlRegex = /^https?:\/\/([^/]+)\.web3(|:\d+)(|\/.*)$/i;
const htmlTagRegex = /<html(?:\s[^>]*)?>/i;
const headTagRegex = /<head(?:\s[^>]*)?>/i;
const baseTagRegexGlobal = /<base(?:\s[^>]*)?>/gi;
const linkTagRegexGlobal = /<link(|\s[^>]*)>/gi;
const scriptTagRegexGlobal = /<script((?:\s[^>]*)?)>((?:(?!<\/script).)*?)<\/script\s*>/gi;
const quotedAttributeRegex = /([-_\w\.]+)=(['"])((?:(?!\2).)*)\2/i;
const unquotedAttributeRegex = /([-_\w\.]+)=\S*/i;
const nakedAttributeRegex = /([-_\w\.]+)/i;
const testHttpUrl = 'https://test.null/';
const testHttpUrlLength = testHttpUrl.length;

function resolveUrl(origin: web3Url, path: string): string {
	if (path.startsWith(web3Scheme) || path.startsWith(httpScheme) || path.startsWith(httpsScheme)) {
		return path;
	}
	if (path.startsWith('//')) {
		return 'web3:' + path;
	}
	let foobarUrl = new URL(path, testHttpUrl).href;
	if (!foobarUrl.startsWith(testHttpUrl)) {
		throw new Error('Unexpected URL resolution behavior: trying to resolve:' + path);
	}
	let absolutePath = foobarUrl.substring(testHttpUrlLength - 1);
	if (origin.nameResolution !== null && origin.nameResolution.resolvedName) {
		if (origin.nameResolution.chainId && origin.nameResolution.chainId != 1) {
			return web3Scheme + origin.nameResolution.resolvedName + ':' + String(origin.nameResolution.chainId) + absolutePath;
		}
		return web3Scheme + origin.nameResolution.resolvedName + absolutePath;
	}
	if (origin.chainId && origin.chainId != 1) {
		return web3Scheme + origin.contractAddress + ':' + String(origin.chainId) + absolutePath;
	}
	return web3Scheme + origin.contractAddress + absolutePath;
}

function resolveRewritableUrl(origin: web3Url, path: string): string {
	let resolved = resolveUrl(origin, path);
	if (!resolved.startsWith(web3Scheme)) {
		return resolved;
	}
	let absolutePathWithoutScheme = resolved.substring(web3Scheme.length);
	let absolutePath = '/';
	let absolutePathWithoutSchemeSlashIndex = absolutePathWithoutScheme.indexOf('/');
	if (absolutePathWithoutSchemeSlashIndex !== -1) {
		absolutePath = absolutePathWithoutScheme.substring(absolutePathWithoutSchemeSlashIndex);
	}
	if (origin.nameResolution !== null && origin.nameResolution.resolvedName) {
		if (origin.nameResolution.chainId && origin.nameResolution.chainId != 1) {
			return httpsScheme + origin.nameResolution.resolvedName + '.web3:' + String(origin.nameResolution.chainId) + absolutePath;
		}
		return httpsScheme + origin.nameResolution.resolvedName + '.web3' + absolutePath;
	}
	if (origin.chainId && origin.chainId != 1) {
		return httpsScheme + origin.contractAddress + '.web3:' + String(origin.chainId) + absolutePath;
	}
	return httpsScheme + origin.contractAddress + '.web3' + absolutePath;
}

function looksLikeHTML(code: string): boolean {
	const lowerCode = code.trimStart().toLowerCase();
	if (lowerCode.startsWith('<!doctype html')) {
		return true;
	}
	if (lowerCode.startsWith('<html')) {
		return true;
	}
	if (lowerCode.indexOf('<head') != -1) {
		return true;
	}
	return false;
}

function processHTMLScriptTag(origin: web3Url, match: string, scriptAttributes: string, body: string): string {
	let result = ['<script'];
	let scriptSrc = '';
	for (let attribute of scriptAttributes.split(/\s+/g)) {
		if (attribute == '') {
			continue;
		}
		let attributeMatch = attribute.match(quotedAttributeRegex);
		if (attributeMatch) {
			if (attributeMatch[1] == 'src') {
				scriptSrc = attributeMatch[3];
				continue;
			}
			if (attributeMatch[1] == 'integrity') {
				continue;
			}
			result.push(attributeMatch[0]);
			continue;
		}
		attributeMatch = attribute.match(unquotedAttributeRegex);
		if (attributeMatch) {
			if (attributeMatch[1] == 'src') {
				scriptSrc = attributeMatch[3];
				continue;
			}
			if (attributeMatch[1] == 'integrity') {
				continue;
			}
			result.push(attributeMatch[0]);
			continue;
		}
		attributeMatch = attribute.match(nakedAttributeRegex);
		if (attributeMatch) {
			if (attributeMatch[1] == 'src') {
				scriptSrc = '';
				continue;
			}
			if (attributeMatch[1] == 'integrity') {
				continue;
			}
			result.push(attributeMatch[0]);
			continue;
		}
	}
	if (scriptSrc != '') {
		result.push('src="' + chromeExtensionPrefix + web3ScriptUrlScheme + Base64.encode(resolveUrl(origin, scriptSrc)) + '"');
	} else {
		result.push('src="' + chromeExtensionPrefix + web3ScriptInlineScheme + Base64.encode(body.trim()) + '"');
	}
	result.push('></script>');
	return result.join(' ');
}

function processHTMLLinkTag(origin: web3Url, match: string, linkAttributes: string): string {
	let result = ['<link'];
	let linkRel = '';
	let linkHref = '';
	for (let attribute of linkAttributes.split(/\s+/g)) {
		if (attribute == '') {
			continue;
		}
		let attributeMatch = attribute.match(quotedAttributeRegex);
		if (attributeMatch) {
			if (attributeMatch[1] == 'rel') {
				linkRel = attributeMatch[3];
				continue;
			}
			if (attributeMatch[1] == 'href') {
				linkHref = attributeMatch[3];
				continue;
			}
			result.push(attributeMatch[0]);
			continue;
		}
		attributeMatch = attribute.match(unquotedAttributeRegex);
		if (attributeMatch) {
			if (attributeMatch[1] == 'rel') {
				linkRel = attributeMatch[3];
				continue;
			}
			if (attributeMatch[1] == 'href') {
				linkHref = attributeMatch[3];
				continue;
			}
			result.push(attributeMatch[0]);
			continue;
		}
		attributeMatch = attribute.match(nakedAttributeRegex);
		if (attributeMatch) {
			if (attributeMatch[1] == 'rel') {
				linkRel = '';
				continue;
			}
			if (attributeMatch[1] == 'href') {
				linkHref = '';
				continue;
			}
			result.push(attributeMatch[0]);
			continue;
		}
	}
	if (linkRel != 'stylesheet' && linkRel != 'icon') {
		return '';
	}
	result.push('rel="' + linkRel + '"');
	result.push('href="' + resolveRewritableUrl(origin, linkHref) + '"');
	result.push('/>');
	return result.join(' ');
}

function processHTML(origin: web3Url, code: string): string {
	const baseTag = '<base href="' + resolveRewritableUrl(origin, '/') + '" />'
	code = code.replaceAll(baseTagRegexGlobal, '');
	if (code.match(headTagRegex)) {
		code = code.replace(headTagRegex, '$&' + baseTag);
	} else {
		if (code.match(htmlTagRegex)) {
			code = code.replace(htmlTagRegex, '$&<head>' + baseTag + '</head>');
		} else {
			code = '<html><head>' + baseTag + '</head>' + code + '</html>';
		}
	}
	code = code.replaceAll(linkTagRegexGlobal, (match: string, linkAttributes: string) => {
		return processHTMLLinkTag(origin, match, linkAttributes);
	});
	code = code.replaceAll(scriptTagRegexGlobal, (match: string, scriptAttributes: string, body: string) => {
		return processHTMLScriptTag(origin, match, scriptAttributes, body);
	});
	return code;
}

function processJavascript(origin: web3Url, code: string): string {
	let random = String(Math.random()).replaceAll('.', '');
	return `
var chrome = null;
window.chrome = null;
` + code;
}

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

async function makeWeb3Response(web3Promise: Promise<web3FetchResult>, forceMime: string, processors: web3BodyProcessor[]): Promise<Response> {
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
				stringBody = processor(result.parsedUrl, stringBody);
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

async function serveWeb3Request(extReq: extRequest): Promise<Response> {
	const web3Promise = fetchUrl(extReq.url);
	let result: web3FetchResult;
	try {
		result = await web3Promise;
	} catch (e) {
		if (developmentMode()) {
			throw e;
		}
		return makeWeb3Response(web3Promise, 'text/plain', null);
	}
	if (result.mimeType == 'text/html' || result.mimeType == 'application/xhtml+xml' || looksLikeHTML(String(result.output))) {
		return makeWeb3Response(web3Promise, 'text/html', [processHTML]);
	} else if (result.mimeType == 'text/javascript') {
		return makeWeb3Response(web3Promise, 'text/javascript', [processJavascript]);
	} else {
		return makeWeb3Response(web3Promise, null, null);
	}
}

async function serveWeb3ScriptURLRequest(extReq: extRequest): Promise<Response> {
	const encodedUrl = extReq.url.substring(web3ScriptUrlScheme.length);
	const decodedUrl = Base64.decode(encodedUrl);
	if (decodedUrl.startsWith(web3Scheme)) {
		return makeWeb3Response(fetchUrl(decodedUrl), 'text/javascript', [processJavascript]);
	}
	if (!decodedUrl.startsWith(httpScheme) && !decodedUrl.startsWith(httpsScheme)) {
		if (developmentMode()) {
			console.log('Got invalid URL: encoded=', encodedUrl, '; decoded=', decodedUrl);
		}
		return makeResponse('invalid URL: ' + encodedUrl, 501, {
			'content-type': 'text-plain',
		});
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
	const finalScript = processJavascript(null, scriptBody);
	return makeResponse(finalScript, result.status, {
		'content-type': 'text/javascript',
	});
}

async function serveWeb3ScriptInlineRequest(extReq: extRequest): Promise<Response> {
	const encodedScript = extReq.url.substring(web3ScriptInlineScheme.length);
	const decodedScript = Base64.decode(encodedScript);
	const finalScript = processJavascript(null, decodedScript);
	return makeResponse(finalScript, 200, {
		'content-type': 'text/javascript',
	});
}

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
	if (url.startsWith(web3Scheme)) {
		return serveWeb3Request(extReq);
	} else if (url.startsWith(web3ScriptUrlScheme)) {
		return serveWeb3ScriptURLRequest(extReq);
	} else if (url.startsWith(web3ScriptInlineScheme)) {
		return serveWeb3ScriptInlineRequest(extReq);
	} else {
		let rewritableUrlMatch = url.match(rewritableUrlRegex);
		if (rewritableUrlMatch) {
			url = web3Scheme + rewritableUrlMatch[1] + rewritableUrlMatch[2] + rewritableUrlMatch[3];
			const rewrittenReq: extRequest = {
				request: request,
				url: url,
			};
			return serveWeb3Request(rewrittenReq);
		}
		return makeResponse('invalid request', 400, {});
	}
}

self.addEventListener('fetch', (event: FetchEvent) => {
	event.respondWith(handleRequest(event.request));
});

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

interface gatewayChain {
	w3link: string;
	chainId: number;
};

const gatewayChains: gatewayChain[] = [
	{w3link: 'eth',             chainId: 1},
	{w3link: 'w3q-g',           chainId: 3334},
	{w3link: 'oeth',            chainId: 10},
	{w3link: 'arb1',            chainId: 42161},
	{w3link: 'arb-nova',        chainId: 42170},
	{w3link: 'metis-andromeda', chainId: 1088},
	{w3link: 'scr-prealpha',    chainId: 534354},
	{w3link: 'basegor',         chainId: 84531},
	{w3link: 'bnb',             chainId: 56},
	{w3link: 'avax',            chainId: 43114},
	{w3link: 'ftm',             chainId: 250},
	{w3link: 'matic',           chainId: 137},
	{w3link: 'qkc-s0',          chainId: 100001},
	{w3link: 'hmy-s0',          chainId: 1666600000},
	{w3link: 'evmos',           chainId: 9001},
];

const allDeclarativeNetRequestRuleResourceTypes: chrome.declarativeNetRequest.ResourceType[] = [
	chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
	chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
	chrome.declarativeNetRequest.ResourceType.STYLESHEET,
	chrome.declarativeNetRequest.ResourceType.SCRIPT,
	chrome.declarativeNetRequest.ResourceType.IMAGE,
	chrome.declarativeNetRequest.ResourceType.FONT,
	chrome.declarativeNetRequest.ResourceType.OBJECT,
	chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
	chrome.declarativeNetRequest.ResourceType.PING,
	chrome.declarativeNetRequest.ResourceType.CSP_REPORT,
	chrome.declarativeNetRequest.ResourceType.MEDIA,
	chrome.declarativeNetRequest.ResourceType.WEBSOCKET,
	chrome.declarativeNetRequest.ResourceType.OTHER,
];

function getDeclarativeNetRequestRules(): chrome.declarativeNetRequest.Rule[] {
	let rules: chrome.declarativeNetRequest.Rule[] = [
		// Internal *.web3 rewrite rule.
		{
			'id': 1,
			'priority': 1,
			'action': {
				'type': chrome.declarativeNetRequest.RuleActionType.REDIRECT,
				'redirect': {
					'regexSubstitution': chromeExtensionPrefix + web3Scheme + '\\1\\2\\3',
				},
			},
			'condition': {
				'regexFilter': '^https?://([^/]+)\\.web3(|:\\d+)(|/.*)$',
				'resourceTypes': allDeclarativeNetRequestRuleResourceTypes,
			},
		},
		// Special-case *.w3eth.io rewrite rule:
		{
			'id': 1000,
			'priority': 1,
			'action': {
				'type': chrome.declarativeNetRequest.RuleActionType.REDIRECT,
				'redirect': {
					'regexSubstitution': chromeExtensionPrefix + web3Scheme + '\\1.eth\\2',
				},
			},
			'condition': {
				'regexFilter': '^https?://([^/]+)\\.w3eth.io(|/.*)$',
				'resourceTypes': allDeclarativeNetRequestRuleResourceTypes,
			},
		},
	];
	// Start w3link rules at ID 1001.
	let ruleId = 1001;
	for (let gateway of gatewayChains) {
		let portPart = '';
		if (gateway.chainId == 1) {
			portPart = ':' + String(gateway.chainId);
		}
		rules.push({
			'id': ruleId,
			'priority': 1,
			'action': {
				'type': chrome.declarativeNetRequest.RuleActionType.REDIRECT,
				'redirect': {
					'regexSubstitution': chromeExtensionPrefix + web3Scheme + '\\1' + portPart + '\\2',
				},
			},
			'condition': {
				'regexFilter': '^https?://([^/]+)\\.' + gateway.w3link + '\\.w3link.io(|/.*)$',
				'resourceTypes': allDeclarativeNetRequestRuleResourceTypes,
			},
		});
		ruleId++;
	}
	return rules;
}

function getAllPastDeclarativeNetRequestRuleIds(): number[] {
	let ruleIds = [];
	for (let rule of getDeclarativeNetRequestRules()) {
		ruleIds.push(rule.id);
	}
	return ruleIds;
}

chrome.declarativeNetRequest.updateDynamicRules({
	removeRuleIds: getAllPastDeclarativeNetRequestRuleIds(),
	addRules: getDeclarativeNetRequestRules(),
});
