import { web3Url } from './../web3-url';
const he = require('he');
const Base64 = require('js-base64');

const chromeExtensionPrefix = chrome.runtime.getURL('/');
const web3UrlScheme = 'web3://';
const web3ScriptUrlScheme = 'web3scripturl://';
const web3ScriptInlineScheme = 'web3scriptinline://';
const web3ScriptInitScheme = 'web3scriptinit://';
const web3StylesheetScheme = 'web3stylesheet://';
const web3FaviconScheme = 'web3favicon://';
const htmlTagRegex = /<html(?:\s[^>]*)?>/i;
const headTagRegex = /<head(?:\s[^>]*)?>/i;
const baseTagRegexGlobal = /<base(?:\s[^>]*)?>/gi;
const linkTagRegexGlobal = /<link(|\s[^>]*)>/gi;
const scriptTagRegexGlobal = /<script((?:\s[^>]*)?)>((?:(?!<\/script).)*?)<\/script\s*>/sgi;
const quotedAttributeRegex = /([-_\w\.]+)=(['"])((?:(?!\2).)*)\2/si;
const unquotedAttributeRegex = /([-_\w\.]+)=\S*/i;
const nakedAttributeRegex = /([-_\w\.]+)/i;
const cssCommentsRegexGlobal = /\/\*.*?\*\//sgi;
const cssRuleRegex = /^[-_\.#"'\[\]\w]+\s*(?:,\s*[-_\.#"'\[\]\w]+\s*)*\{/i;
const cssAtRuleRegex = /^@(?:-|font|charset|keyframes|media)\b/i;

export class htmlProcessor {
	readonly url: web3Url;
	foundFavicon: boolean;

	constructor(url: web3Url) {
		this.url = url;
		this.foundFavicon = false;
	}

	// Processes a <script> tag match result.
	// Used during HTML processing.
	protected processHTMLScriptTag = (match: string, scriptAttributes: string, body: string): string => {
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
				result.push(attributeMatch[0]);
				continue;
			}
			attributeMatch = attribute.match(unquotedAttributeRegex);
			if (attributeMatch) {
				if (attributeMatch[1] == 'src') {
					scriptSrc = attributeMatch[3];
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
				result.push(attributeMatch[0]);
				continue;
			}
		}
		if (scriptSrc != '') {
			result.push('src="' + chromeExtensionPrefix + web3ScriptUrlScheme + Base64.encode(this.url.maybeHttp(scriptSrc)) + '"');
		} else {
			result.push('src="' + chromeExtensionPrefix + web3ScriptInlineScheme + Base64.encode(body.trim()) + '"');
		}
		result.push('></script>');
		return result.join(' ');
	}

	// Processes a <link> tag match result.
	// Used during HTML processing.
	protected processHTMLLinkTag = (match: string, linkAttributes: string): string => {
		let result = ['<link'];
		let linkRel = '';
		let linkAs = '';
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
				if (attributeMatch[1] == 'as') {
					linkAs = attributeMatch[3];
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
				if (attributeMatch[1] == 'as') {
					linkAs = attributeMatch[3];
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
				if (attributeMatch[1] == 'as') {
					linkAs = '';
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
		if (linkRel == 'prefetch' && linkAs == 'script') {
			result.push('rel="prefetch"');
			result.push('rel="script"');
			result.push('href="' + chromeExtensionPrefix + web3ScriptUrlScheme + Base64.encode(this.url.maybeHttp(linkRel)) + '"');
			result.push('/>');
			return result.join(' ');
		}
		if (linkRel != 'stylesheet' && linkRel != 'icon') {
			return '';
		}
		if (linkRel == 'icon') {
			this.foundFavicon = true;
		}
		result.push('rel="' + linkRel + '"');
		if (linkAs != '') {
			result.push('as="' + he.encode(linkAs) + '"');
		}
		let linkUrl = this.url.maybeHttp(linkHref);
		if (linkUrl.startsWith(web3UrlScheme)) {
			if (linkRel == 'stylesheet') {
				linkUrl = chromeExtensionPrefix + web3StylesheetScheme + (new web3Url(linkUrl)).toString().substr(web3UrlScheme.length);
			} else {
				linkUrl = chromeExtensionPrefix + linkUrl
			}
		}
		result.push('href="' + he.encode(linkUrl) + '"');
		result.push('/>');
		return result.join(' ');
	}

	protected baseTag = (): string => {
		return '<base href="' + he.encode(this.url.getRoot().toRewritable()) + '" />';
	}

	protected initJavaScriptTag = (): string => {
		return '<script src="' + chromeExtensionPrefix + web3ScriptInitScheme + Base64.encode(this.url.toString()) + '"></script>';
	}

	protected faviconTag = (): string => {
		if (this.foundFavicon) {
			return '';
		}
		return '<link rel="icon" href="' + chromeExtensionPrefix + web3FaviconScheme + he.encode(this.url.getRoot().toString()) + '" />';
	}

	// Rewrites HTML code to work in a chrome-extension context.
	processHtml = (code: string): string => {
		code = code.replaceAll(baseTagRegexGlobal, '');
		code = code.replaceAll(linkTagRegexGlobal, this.processHTMLLinkTag);
		code = code.replaceAll(scriptTagRegexGlobal, this.processHTMLScriptTag);
		const injectedTags = this.baseTag() + this.initJavaScriptTag() + this.faviconTag();
		const headMatch = code.match(headTagRegex);
		if (headMatch) {
			let insertIndex = headMatch.index + headMatch[0].length;
			code = code.substring(0, insertIndex) + injectedTags + code.substring(insertIndex);
		} else {
			const htmlMatch = code.match(htmlTagRegex);
			if (htmlMatch) {
				let insertIndex = htmlMatch.index + htmlMatch[0].length;
				code = code.substring(0, insertIndex) + injectedTags + code.substring(insertIndex);
			} else {
				code = '<html><head>' + injectedTags + '</head>' + code + '</html>';
			}
		}
		return code;
	}
}

// Returns whether the given string looks like HTML.
export function looksLikeHTML(code: string): boolean {
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

// Returns whether the given string looks like CSS.
export function looksLikeCSS(code: string): boolean {
	const noCommentsCode = code.toLowerCase().replaceAll(cssCommentsRegexGlobal, '').trimStart();
	if (noCommentsCode.match(cssRuleRegex) || noCommentsCode.match(cssAtRuleRegex)) {
		return true;
	}
	return false;
}
