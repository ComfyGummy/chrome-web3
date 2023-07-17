const web3SchemeProtocol = 'web3';
const urlSchemeRegex = /^\w+:\/\//i;
const web3Scheme = web3SchemeProtocol + '://';
const dataScheme = 'data:';
const httpScheme = 'http://';
const httpsScheme = 'https://';
const web3UrlRegex = /^web3:\/\/(?:|(?<userInfo>[^@]+)@)(?<hostname>[^:\/]+)(?:|:(?<chainId>[1-9]\d*))(?<path>|\/.*)$/i;
const rewritableUrlRegex = /^https?:\/\/(?:|(?<userInfo>[^@]+)@)(?<hostname>[^:\/]+)\.web3(?:|:(?<chainId>[1-9]\d*))(?<path>|\/.*)$/i;
const testHttpUrl = 'https://test.null';
const testHttpUrlLength = testHttpUrl.length;
const fictitiousWeb3Tld = '.web3';

// A parsed (but not resolved) ERC-4804 URL.
export class web3Url {
	readonly userInfo: string;
	readonly hostname: string;
	readonly chainId:  number;
	readonly path:     string;

	constructor(url: string) {
		let matchResult = null;
		if (url.startsWith(web3Scheme)) {
			matchResult = url.match(web3UrlRegex);
		} else if (url.startsWith(httpsScheme) || url.startsWith(httpScheme)) {
			matchResult = url.match(rewritableUrlRegex);
		}
		if (matchResult == null) {
			throw new Error('Invalid web3 URL: ' + url);
		}
		this.userInfo = matchResult.groups.userInfo ? matchResult.groups.userInfo : null;
		this.hostname = matchResult.groups.hostname;
		this.chainId = isNaN(parseInt(matchResult.groups.chainId)) ? 1 : parseInt(matchResult.groups.chainId);
		this.path = matchResult.groups.path ? matchResult.groups.path : '/';
	}

	toString(): string {
		return web3Scheme + (this.userInfo ? (this.userInfo + '@') : '') + this.hostname + (this.chainId != 1 ? (':' + this.chainId.toString()) : '') + this.path;
	}

	toRewritable(): string {
		return httpsScheme + (this.userInfo ? (this.userInfo + '@') : '') + this.hostname + fictitiousWeb3Tld + (this.chainId != 1 ? (':' + this.chainId.toString()) : '') + this.path;
	}

	// Resolves a relative or absolute path against a web3 URL.
	// For example:
	// resolveUrl(web3Url("web3://example.eth/some/thing"), "../other") = web3Url("web3://example.eth/some/other")
	resolve(href: string): web3Url {
		if (href.startsWith(web3Scheme)) {
			return new web3Url(href);
		}
		if (href.match(urlSchemeRegex)) {
			throw new Error('Not a web3 URL: ' + href);
		}
		if (href.startsWith('//')) {
			return new web3Url(web3SchemeProtocol + ':' + href);
		}
		const urlRoot = web3Scheme + (this.userInfo ? (this.userInfo + '@') : '') + this.hostname + (this.chainId != 1 ? (':' + this.chainId.toString()) : '');
		if (href.startsWith('/')) {
			return new web3Url(urlRoot + href);
		}
		const testUrl = new URL(href, testHttpUrl + this.path).href;
		if (!testUrl.startsWith(testHttpUrl)) {
			throw new Error('Unexpected URL resolution behavior: trying to resolve:' + href);
		}
		return new web3Url(urlRoot + testUrl.substring(testHttpUrlLength));
	}

	// maybeHttp resolves a URL but also accepts and returns HTTP URLs as-is.
	// For web3:// URLs, it will return the string version of the URL.
	maybeHttp(href: string): string {
		if (href.startsWith(httpsScheme) || href.startsWith(httpScheme) || href.startsWith(dataScheme)) {
			return href;
		}
		return this.resolve(href).toString();
	}

	// rewritableMaybeHttp resolves a URL but also accepts and returns HTTP URLs as-is.
	// For web3:// URLs, it will return the rewritable version of it.
	rewritableMaybeHttp(href: string): string {
		if (href.startsWith(httpsScheme) || href.startsWith(httpScheme) || href.startsWith(dataScheme)) {
			return href;
		}
		return this.resolve(href).toRewritable();
	}

	getRoot(): web3Url {
		return this.resolve('/');
	}

	origin(): string {
		if (this.path !== '/') {
			return this.getRoot().origin();
		}
		let root = this.toString();
		return root.substring(0, root.length - 1);
	}
}
