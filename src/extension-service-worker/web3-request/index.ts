import { Config, getConfig } from '../config';
import { web3Url } from '../web3-url';
import { Client } from 'web3protocol';

// The result of resolving the "domain" component of an ERC-4804 address.
export interface web3UrlNameResolution {
	chainId: number;
	resolvedName: string;
}

// An origin for a ERC-4804 URL.
export interface web3Origin {
	nameResolution: web3UrlNameResolution;
	contractAddress: string;
	chainId: number;
}

// A key-value dictionary of HTTP headers.
// Keys are case-insensitive.
interface httpHeaders {
	[key: string]: string
}

// The result of fetching a ERC-4804 URL.
export interface web3FetchResult {
	output: Uint8Array;
	httpCode: number;
	httpHeaders: httpHeaders;
	parsedUrl: web3Origin;
}

export class web3Client {
	client: Client;
	config: Config;
	constructor() {
		this.config = getConfig();
		this.config.addCallback(this.initClient);
		this.client = null;
	}
	initClient = async () => {
		const defaultChainData = await this.config.toDefaultChainListData();
		this.client = new Client(defaultChainData);
	};
	fetchUrl = async (url: web3Url): Promise<web3FetchResult> => {
		if (this.client == null) {
			await this.initClient();
		}
		return this.client.fetchUrl(url.toString());
	}
};
