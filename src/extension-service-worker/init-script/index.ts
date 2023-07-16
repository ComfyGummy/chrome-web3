import { web3Url } from './../web3-url';

type jsExpression = string;
type jsStatement  = string;
type jsStatements = jsStatement[];

function escape(s: string): jsExpression {
	if (encodeURIComponent(s) === s) {
		return '"' + s + '"';
	}
	return 'decodeURIComponent("' + encodeURIComponent(s) + '")';
}

function sealProperty(obj: jsExpression, propName: string, value: jsExpression): jsStatement {
	let escapedProp = escape(propName);
	return (
`(() => {
	let obj = ${obj};
	while (obj !== null) {
		if (Object.hasOwnProperty(obj, ${escapedProp})) {
			Object.defineProperty(obj, ${escapedProp}, {"value": ${value}, "writable": false, "configurable": false});
		}
		obj = Object.getPrototypeOf(obj);
	}
})()`
	);
}

function nullWindowProperty(propName: string): jsStatements {
	return [
		'var ' + propName + ' = null',
		'window.' + propName + ' = null',
		sealProperty('window', propName, 'null'),
	];
}

function nullNavigatorProperty(propName: string): jsStatements {
	return [
		'navigator.' + propName + ' = null',
		sealProperty('navigator', propName, 'null'),
	];
}

const staticInit: jsStatements = [].concat(
	nullWindowProperty('chrome'),
	nullWindowProperty('browser'),
	nullWindowProperty('open'),
	nullNavigatorProperty('registerProtocolHandler'),
);

export class initScript {
	readonly url: web3Url;

	constructor(url: web3Url) {
		this.url = url;
	}

	render = (): string => {
		return staticInit.join(';\n');
	}
}
