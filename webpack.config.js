const webpack = require('webpack');
const path = require('path');

var mode = process.env.NODE_ENV || 'development';

var entries = {
	'chrome-web3-extension-options': {
		import: './src/extension-service-worker/options/options.ts',
		filename: './chrome-web3-extension-options/options.js',
	},
	'chrome-web3-extension-service-worker': {
		import: './src/extension-service-worker/chrome-web3-extension-service-worker.ts',
		filename: './chrome-web3-extension/chrome-web3-extension-service-worker.js',
	},
};

if (process.env.WEBPACK_ENTRY) {
	var entryName = (process.env.WEBPACK_ENTRY);
	var newEntries = {};
	newEntries[process.env.WEBPACK_ENTRY] = entries[process.env.WEBPACK_ENTRY];
	entries = newEntries;
}

module.exports = {
	entry: entries,
	devtool: (mode === 'development') ? 'inline-source-map' : false,
	mode: mode,
	module: {
		rules: [
			{
				test: /\.(html|css|svg|raw\.\w+)$/,
				use: [
					{
						loader: 'raw-loader',
					},
				],
			},
			{
				test: /\.s[ac]ss$/i,
				use: [
					'raw-loader',
					'sass-loader',
				],
			},
			{
				test: /\.(webp|png|jpg)$/,
				use: [
					{
						loader: 'binary-loader',
					},
				],
			},
			{
				test: /\.ts$/,
				use: [
					{
						loader: 'ts-loader',
						options: {
							compilerOptions: {
								noEmit: false,
								module: 'NodeNext',
								moduleResolution: 'nodenext',
							},
						},
					},
				],
				exclude: /node_modules/,
			},
		],
	},
	optimization: {
		minimize: false
	},
	plugins: [
		new webpack.ProvidePlugin({
			Buffer: ['buffer', 'Buffer'],
		}),
	],
	resolve: {
		extensions: ['.ts', '.js'],
		fallback: {
			'path': require.resolve('path-browserify'),
		},
		alias: {
			'@chrome-web3-extension-options': path.resolve('/', './dist/chrome-web3-extension-options'),
		},
	},
};
