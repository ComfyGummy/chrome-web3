const webpack = require('webpack');

var mode = process.env.NODE_ENV || 'development';

module.exports = {
	entry: {
		'chrome-web3-extension-service-worker': {
			import: "./src/extension-service-worker/chrome-web3-extension-service-worker.ts",
			filename: "./chrome-web3-extension-service-worker.js",
		},
	},
	devtool: (mode === 'development') ? 'inline-source-map' : false,
	mode: mode,
	module: {
		rules: [
			{
				test: /\.ts$/,
				use: [
					{
						loader: 'ts-loader',
						options: {
							compilerOptions: { noEmit: false },
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
			'path': require.resolve("path-browserify"),
		},
	},
};
