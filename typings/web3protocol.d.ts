declare module 'web3protocol' {
	export class Client {
		constructor(chainList: any[]);
		fetchUrl(url: string): Promise<any>;
	}
};
declare module 'web3protocol/chains';
