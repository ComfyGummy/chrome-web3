import { developmentMode } from './../development-mode';
const optionsHtml = require('./../options/options.html').default;
const optionsBootstrapJS = require('./../options/bootstrap.raw.js').default;
const optionsJQueryJS = require('./../options/jquery.raw.js').default;
const optionsBootstrapCSS = require('./../options/bootstrap.css').default;
const optionsCSS = require('./../options/options.scss').default;
const optionsJS = require('raw-loader!@chrome-web3-extension-options/options.js').default;
const optionsSpinnerSVG = require('./../options/spinner.svg').default;
const optionsDoneSVG = require('./../options/done.svg').default;
const optionsNotDoneSVG = require('./../options/not-done.svg').default;
const optionsFailureSVG = require('./../options/failure.svg').default;
const optionsEthereumSVG = require('./../options/ethereum.svg').default;
const optionsWeb3URLPNG = require('./../options/web3url.png');
const optionsVitalikBlogJPEG = require('./../options/vitalik-blog.jpg');
const optionsGitHubSVG = require('./../options/github.svg').default;
const notFoundHtml = require('./../options/not-found.html').default;

const optionsChainsArbitrumNova = require('./../options/chains/arb-nova.webp');
const optionsChainsArbitrumOne = require('./../options/chains/arb1.webp');
const optionsChainsAvalanche = require('./../options/chains/avax.webp');
const optionsChainsBase = require('./../options/chains/base.webp');
const optionsChainsEthereum = require('./../options/chains/eth.webp');
const optionsChainsFantom = require('./../options/chains/ftm.webp');
const optionsChainsFilecoin = require('./../options/chains/filecoin.webp');
const optionsChainsGnosis = require('./../options/chains/gno.webp');
const optionsChainsMantle = require('./../options/chains/mantle.webp');
const optionsChainsOPMainnet = require('./../options/chains/oeth.webp');
const optionsChainsPolygon = require('./../options/chains/matic.webp');
const optionsChainsWeb3Q = require('./../options/chains/w3q.webp');
const optionsChainsZKSyncEra = require('./../options/chains/zksync.webp');
const optionsChainsZora = require('./../options/chains/zora.webp');

function makeResponse(data: string|Uint8Array, status: number, mimeType: string): Response {
	return new Response(new Blob([data]), {
		'status': status,
		'headers': {
			'content-type': mimeType,
		},
	});
}

function stringToUint8(bin: string): Uint8Array {
	let array = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) {
		array[i] = bin.charCodeAt(i);
	}
	return array;
}

export async function renderOptionsUrl(url: string): Promise<Response> {
	switch (url) {
		case 'options':
			return makeResponse(optionsHtml, 200, 'text/html');
		case 'options/bootstrap.raw.js':
			return makeResponse(optionsBootstrapJS, 200, 'text/javascript');
		case 'options/jquery.raw.js':
			return makeResponse(optionsJQueryJS, 200, 'text/javascript');
		case 'options/bootstrap.css':
			return makeResponse(optionsBootstrapCSS, 200, 'text/css');
		case 'options/options.css':
			return makeResponse(optionsCSS, 200, 'text/css');
		case 'options/options.js':
			return makeResponse(optionsJS, 200, 'text/javascript');
		case 'options/spinner.svg':
			return makeResponse(optionsSpinnerSVG, 200, 'image/svg+xml');
		case 'options/done.svg':
			return makeResponse(optionsDoneSVG, 200, 'image/svg+xml');
		case 'options/not-done.svg':
			return makeResponse(optionsNotDoneSVG, 200, 'image/svg+xml');
		case 'options/failure.svg':
			return makeResponse(optionsFailureSVG, 200, 'image/svg+xml');
		case 'options/ethereum.svg':
			return makeResponse(optionsEthereumSVG, 200, 'image/svg+xml');
		case 'options/web3-url.png':
			return makeResponse(stringToUint8(optionsWeb3URLPNG), 200, 'image/png');
		case 'options/vitalik-blog.jpg':
			return makeResponse(stringToUint8(optionsVitalikBlogJPEG), 200, 'image/jpeg');
		case 'options/github.svg':
			return makeResponse(stringToUint8(optionsGitHubSVG), 200, 'image/svg+xml');
		case 'options/chains/arb-nova.webp':
			return makeResponse(stringToUint8(optionsChainsArbitrumNova), 200, 'image/webp');
		case 'options/chains/arb1.webp':
			return makeResponse(stringToUint8(optionsChainsArbitrumOne), 200, 'image/webp');
		case 'options/chains/avax.webp':
			return makeResponse(stringToUint8(optionsChainsAvalanche), 200, 'image/webp');
		case 'options/chains/base.webp':
			return makeResponse(stringToUint8(optionsChainsBase), 200, 'image/webp');
		case 'options/chains/eth.webp':
			return makeResponse(stringToUint8(optionsChainsEthereum), 200, 'image/webp');
		case 'options/chains/ftm.webp':
			return makeResponse(stringToUint8(optionsChainsFantom), 200, 'image/webp');
		case 'options/chains/filecoin.webp':
			return makeResponse(stringToUint8(optionsChainsFilecoin), 200, 'image/webp');
		case 'options/chains/gno.webp':
			return makeResponse(stringToUint8(optionsChainsGnosis), 200, 'image/webp');
		case 'options/chains/mantle.webp':
			return makeResponse(stringToUint8(optionsChainsMantle), 200, 'image/webp');
		case 'options/chains/oeth.webp':
			return makeResponse(stringToUint8(optionsChainsOPMainnet), 200, 'image/webp');
		case 'options/chains/matic.webp':
			return makeResponse(stringToUint8(optionsChainsPolygon), 200, 'image/webp');
		case 'options/chains/w3q.webp':
			return makeResponse(stringToUint8(optionsChainsWeb3Q), 200, 'image/webp');
		case 'options/chains/w3q-t.webp':
			return makeResponse(stringToUint8(optionsChainsWeb3Q), 200, 'image/webp');
		case 'options/chains/w3q-g.webp':
			return makeResponse(stringToUint8(optionsChainsWeb3Q), 200, 'image/webp');
		case 'options/chains/zksync.webp':
			return makeResponse(stringToUint8(optionsChainsZKSyncEra), 200, 'image/webp');
		case 'options/chains/zora.webp':
			return makeResponse(stringToUint8(optionsChainsZora), 200, 'image/webp');
		default:
			return makeResponse(notFoundHtml, 404, 'text/html');
	}
}
