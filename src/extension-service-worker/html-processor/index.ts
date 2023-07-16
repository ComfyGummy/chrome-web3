import { web3Url } from './../web3-url';
const he = require('he');
const Base64 = require('js-base64');

const chromeExtensionPrefix = chrome.runtime.getURL('/');
const web3ScriptUrlScheme = 'web3scripturl://';
const web3ScriptInlineScheme = 'web3scriptinline://';
const web3ScriptInitScheme = 'web3scriptinit://';
const htmlTagRegex = /<html(?:\s[^>]*)?>/i;
const headTagRegex = /<head(?:\s[^>]*)?>/i;
const baseTagRegexGlobal = /<base(?:\s[^>]*)?>/gi;
const linkTagRegexGlobal = /<link(|\s[^>]*)>/gi;
const scriptTagRegexGlobal = /<script((?:\s[^>]*)?)>((?:(?!<\/script).)*?)<\/script\s*>/gi;
const quotedAttributeRegex = /([-_\w\.]+)=(['"])((?:(?!\2).)*)\2/i;
const unquotedAttributeRegex = /([-_\w\.]+)=\S*/i;
const nakedAttributeRegex = /([-_\w\.]+)/i;

export class htmlProcessor {
	readonly url: web3Url;

	constructor(url: web3Url) {
		this.url = url;
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
			result.push('src="' + chromeExtensionPrefix + web3ScriptUrlScheme + Base64.encode(this.url.rewritableMaybeHttp(scriptSrc)) + '"');
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
		result.push('href="' + he.encode(this.url.rewritableMaybeHttp(linkHref)) + '"');
		result.push('/>');
		return result.join(' ');
	}

	protected baseTag = (): string => {
		return '<base href="' + he.encode(this.url.getRoot().toRewritable()) + '" />';
	}

	protected initJavaScriptTag = (): string => {
		return '<script src="' + chromeExtensionPrefix + web3ScriptInitScheme + Base64.encode(this.url.toString()) + '"></script>';
	}

	// Rewrites HTML code to work in a chrome-extension context.
	processHtml = (code: string): string => {
		code = code.replaceAll(baseTagRegexGlobal, '');
		code = code.replaceAll(linkTagRegexGlobal, this.processHTMLLinkTag);
		code = code.replaceAll(scriptTagRegexGlobal, this.processHTMLScriptTag);
		const injectedTags = this.baseTag() + this.initJavaScriptTag();
		const headMatch = code.match(headTagRegex);
		if (headMatch) {
			code = code.substring(0, headMatch.index) + injectedTags + code.substring(headMatch.index);
		} else {
			const htmlMatch = code.match(htmlTagRegex);
			if (htmlMatch) {
				code = code.substring(0, htmlMatch.index) + injectedTags + code.substring(htmlMatch.index);
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
