import { web3Url } from './../web3-url';

type jsVarName    = string;
type jsExpression = string;
type jsStatement  = string;
type jsStatements = jsStatement[];

interface jsFunction {
	argNames: jsVarName[];
	body: (origObj: jsVarName, origFuncName: jsVarName) => jsStatements;
}

const chromeExtensionPrefix = chrome.runtime.getURL('/');
const web3SchemeProtocol = 'web3';
const web3Scheme = web3SchemeProtocol + '://';
const dataScheme = 'data:';
const httpScheme = 'http://';
const httpsScheme = 'https://';
const web3ScriptUrlScheme = 'web3scripturl://';
const web3DevNullScheme = 'web3devnull://';
const testHttpUrl = 'https://test.null';
const testHttpUrlLength = testHttpUrl.length;
const mimeTypeTextJavascript = 'text/javascript';
const noEscapeNeededRegex = /^[-_~#$*()[\]{}?+=:;|/., \w]+$/i;

// Escape a string for use as a JavaScript string literal.
function escape(s: string): jsExpression {
	if (encodeURIComponent(s) === s || s.match(noEscapeNeededRegex)) {
		return '"' + s + '"';
	}
	return 'decodeURIComponent("' + encodeURIComponent(s) + '")';
}

const chromeExtensionPrefixEsc = escape(chromeExtensionPrefix);
const web3SchemeProtocolEsc = escape(web3SchemeProtocol);
const web3SchemeEsc = escape(web3Scheme);
const dataSchemeEsc = escape(dataScheme);
const httpSchemeEsc = escape(httpScheme);
const httpsSchemeEsc = escape(httpsScheme);
const web3ScriptUrlSchemeEsc = escape(web3ScriptUrlScheme);
const web3DevNullSchemeEsc = escape(web3DevNullScheme);
const testHttpUrlEsc = escape(testHttpUrl);
const mimeTypeTextJavascriptEsc = escape(mimeTypeTextJavascript);

// Prevent changes to a property of a given object.
function sealProperty(obj: jsVarName, propName: jsVarName, propDict: jsExpression): jsStatement {
	let escapedProp = escape(propName);
	return (
`(() => {
	let obj = ${obj};
	let propDict = ${propDict};
	while (obj !== null) {
		if (Object.getOwnPropertyDescriptor(obj, ${escapedProp})) {
			Object.defineProperty(obj, ${escapedProp}, propDict);
		}
		obj = Object.getPrototypeOf(obj);
	}
})()`
	);
}

function sealPropertyToValue(obj: jsVarName, propName: jsVarName, value: jsExpression): jsStatement {
	return sealProperty(obj, propName, `{"value": ${value}, "writable": false, "configurable": false}`);
}

// Nullify a property of the window object.
function nullWindowProperty(propName: jsVarName): jsStatements {
	return [
		'var ' + propName + ' = null',
		'window.' + propName + ' = null',
		sealPropertyToValue('window', propName, 'null'),
	];
}

// Nullify a property of the navigator object.
function nullNavigatorProperty(propName: jsVarName): jsStatements {
	return [
		'navigator.' + propName + ' = null',
		sealPropertyToValue('navigator', propName, 'null'),
	];
}

// Wrap an already-defined function within another function.
function wrapFunction(obj: jsVarName, funcName: jsVarName, wrapperFunc: jsFunction): jsStatement {
	let escapedFuncName = escape(funcName);
	let signatureArgs = wrapperFunc.argNames.join(', ');
	let wrappedFuncBody = wrapperFunc.body('origObj', 'origFunc').join(';\n\t\t\t\t\t');
	return (
`(() => {
	let obj = ${obj};
	let isTopLevel = true;
	while (obj !== null) {
		if (isTopLevel || Object.getOwnPropertyDescriptor(obj, ${escapedFuncName})) {
			(() => {
				let origObj = obj;
				let origFunc = obj.${funcName}.bind(origObj);
				let wrapped = function(${signatureArgs}) {
					${wrappedFuncBody}
				};
				obj.${funcName} = wrapped.bind(origObj);
				Object.defineProperty(obj, ${escapedFuncName}, {"writable": false, "configurable": false});
			})();
			isTopLevel = false;
		}
		obj = Object.getPrototypeOf(obj);
	}
})()`
	);
}

// Return the setter function of a property on an object.
function getSetter(obj: jsVarName, propName: jsVarName): jsExpression {
	let escapedProp = escape(propName);
	return (
`(() => {
	let setterObj = ${obj};
	while (setterObj !== null && !Object.getOwnPropertyDescriptor(setterObj, ${escapedProp})) {
		setterObj = Object.getPrototypeOf(setterObj);
	}
	if (setterObj !== null) {
		return Object.getOwnPropertyDescriptor(setterObj, ${escapedProp}).set.bind(${obj});
	}
	return null;
})()`
	);
}

function getEmulatedStorage(): jsExpression {
	return (
`(() => {
	let backing = {};
	let storageObject = {
		'key': ((index) => {
			let i = 0;
			for (let keyName in backing) {
				if (i == index) {
					return keyName;
				}
				i++;
			}
			return null;
		}),
		'getItem': ((keyName) => {
			let keyValue = backing[keyName];
			if (keyValue === undefined) {
				return null;
			}
			return keyValue;
		}),
		'setItem': ((keyName, keyValue) => {
			backing[keyName] = keyValue;
		}),
		'removeItem': ((keyName) => {
			delete backing[keyName];
		}),
		'clear': (() => {
			let allKeys = [];
			for (let keyName in backing) {
				allKeys.push(keyName);
			}
			for (let keyName of allKeys) {
				delete backing[keyName];
			}
		}),
	};
	Object.defineProperty(storageObject, "length", {
		"get": () => {
			let i = 0;
			for (let keyName in backing) {
				i++;
			}
			return i;
		},
		"configurable": false,
	});
	return storageObject;
})()`
	);
}

function getEmulatedCookieProperty(): jsExpression {
	return (
`(() => {
	let cookies = {};
	return {
		'get': () => {
			let cookieString = '';
			let isFirstCookie = true;
			for (let keyName in cookies) {
				if (!isFirstCookie) {
					cookieString += ';';
				} else {
					isFirstCookie = false;
				}
				let cookieValue = cookies[keyName];
				if (cookieValue === '') {
					cookieString += keyName;
				} else {
					cookieString += keyName + '=' + cookieValue;
				}
			}
			return cookieString;
		},
		'set': (newCookie) => {
			let semicolonIndex = newCookie.indexOf(';');
			if (semicolonIndex !== -1) {
				newCookie = newCookie.substring(0, semicolonIndex);
			}
			let equalIndex = newCookie.indexOf('=');
			if (equalIndex !== -1) {
				let keyName = newCookie.substring(0, equalIndex);
				let cookieValue = newCookie.substring(equalIndex + 1);
				cookies[keyName] = cookieValue;
			} else {
				cookies[newCookie] = '';
			}
		},
		'configurable': false,
	};
})()`
	);
}

// Prevent manipulation of new window objects through `window.open`.
const wrapWindowOpen = [wrapFunction('window', 'open', {
	'argNames': ['url', 'target', 'windowFeatures'],
	'body': (origObj: jsVarName, origFuncName: jsVarName): jsStatements => {
		return [
			`${origFuncName}(url, target, windowFeatures)`,
			`return null`
		];
	},
})];

const emulateStorage: jsStatements = [
	sealPropertyToValue('window', 'localStorage', getEmulatedStorage()),
	`var localStorage = window.localStorage`,
	sealPropertyToValue('window', 'sessionStorage', getEmulatedStorage()),
	`var sessionStorage = window.sessionStorage`,
	sealProperty('document', 'cookie', getEmulatedCookieProperty()),
];

const staticInit: jsStatements = [].concat(
	nullWindowProperty('chrome'),
	nullWindowProperty('browser'),
	wrapWindowOpen,
	emulateStorage,
	nullNavigatorProperty('registerProtocolHandler'),
);

export class initScript {
	readonly url: web3Url;
	readonly escapedOrigin: string;
	readonly escapedPath: string;

	constructor(url: web3Url) {
		this.url = url;
		this.escapedOrigin = escape(url.origin());
		this.escapedPath = escape(url.path);
	}

	protected scriptUrl = (href: jsExpression): jsExpression => {
		return (
`(() => {
	let url;
	if (${href}.startsWith(${web3SchemeEsc}) || ${href}.startsWith(${httpsSchemeEsc}) || ${href}.startsWith(${httpSchemeEsc}) || ${href}.startsWith(${dataSchemeEsc})) {
		url = ${href};
	} else if (${href}.startsWith("//")) {
		url = ${web3SchemeProtocolEsc} + ${href};
	} else if (${href}.startsWith("/")) {
		url = ${this.escapedOrigin} + ${href};
	} else {
		url = ${this.escapedOrigin} + (new URL(${href}, ${testHttpUrlEsc} + ${this.escapedPath}).href.substring(${testHttpUrlLength}));
	}
	return ${chromeExtensionPrefixEsc} + ${web3ScriptUrlSchemeEsc} + btoa(url);
})()`
		);
	}

	protected wrapDocumentCreateElement = (): jsStatement => {
		return wrapFunction('document', 'createElement', {
			'argNames': ['tagName', 'options'],
			'body': (origObj: jsVarName, origFuncName: jsVarName) => {
				return [
					`let tag = ${origFuncName}(tagName, options)`,
					`if (tagName === "script") {
						let originalSetter = ${getSetter('tag', 'src')};
						Object.defineProperty(tag, "src", {
							"get": () => {
								return tag["_src"];
							},
							"set": (src) => {
								tag["_src"] = ${this.scriptUrl('src')};
								if (originalSetter !== null) {
									originalSetter(tag["_src"]);
								}
							},
							"configurable": false,
						});
					}`,
					`if (tagName === "link") {
						let asSetter = ${getSetter('tag', 'as')};
						let hrefSetter = ${getSetter('tag', 'href')};
						Object.defineProperty(tag, "as", {
							"get": () => {
								return tag["_as"];
							},
							"set": (linkAs) => {
								tag["_as"] = linkAs;
								if (asSetter !== null) {
									asSetter(linkAs);
								}
								if (linkAs === "script" && tag["_href"]) {
									tag["_href"] = ${this.scriptUrl('tag["_href"]')};
									if (hrefSetter !== null) {
										hrefSetter(tag["_href"]);
									}
								}
							},
							"configurable": false,
						});
						Object.defineProperty(tag, "href", {
							"get": () => {
								return tag["_href"];
							},
							"set": (href) => {
								if (tag["_as"] === "script") {
									tag["_href"] = ${this.scriptUrl('href')};
								} else {
									tag["_href"] = href;
								}
								if (hrefSetter !== null) {
									hrefSetter(tag["_href"]);
								}
							},
							"configurable": false,
						});
					}`,
					`return tag`,
				];
			},
		});
	}

	render = (): string => {
		return [].concat(
			staticInit,
			[this.wrapDocumentCreateElement()],
		).join(';\n');
	}
}
