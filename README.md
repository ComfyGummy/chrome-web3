# Chrome extension for `web3://` (ERC-4804) URLs

This repository contains the code for a Chrome extension implementing the [ERC-4804] URLs (`web3://` URLs). This can be used to create censorship-resistant websites hosted directly on EVM-compatible blockchains such as Ethereum.

## Features

### Website access

The extension supports most ERC-4804 websites.

- `web3://w3eth.eth`

![web3://w3eth.eth](https://raw.githubusercontent.com/ComfyGummy/chrome-web3/main/img/screenshot-w3url.png "web3://w3eth.eth")

- `web3://vitalikblog.eth`

![web3://vitalikblog.eth](https://raw.githubusercontent.com/ComfyGummy/chrome-web3/main/img/screenshot-vitalikblog.png "web3://vitalikblog.eth")

- `web3://app-uniswap-org.eth`

![web3://app-uniswap-org.eth](https://raw.githubusercontent.com/ComfyGummy/chrome-web3/main/img/screenshot-uniswap.png "web3://app-uniswap-org.eth")

- `web3://art-blocks-io.eth/render/78/0`

![web3://art-blocks-io.eth/render/78/0](https://raw.githubusercontent.com/ComfyGummy/chrome-web3/main/img/screenshot-artblocks.png "web3://art-blocks-io.eth/render/78/0")

### HTTP gateway interception

- The extension intercepts all HTTP requests to `*.w3eth.io` and `*.w3link.io` and redirects them to its own service worker. The HTTP request to `*.w3eth.io` never actually makes it onto the network.

![Intercepting a gateway URL access](https://raw.githubusercontent.com/ComfyGummy/chrome-web3/main/img/screencast-gateway-interception.gif "Intercepting a gateway URL access")

### URL bar support

- You can type in `web3://` URLs in the address bar, so long as you write `web3 ` ("web3" and then pressing the spacebar) instead of the `web3://` URL prefix.

![Typing a web3 URL](https://raw.githubusercontent.com/ComfyGummy/chrome-web3/main/img/screencast-typing-url.gif "Typing a web3 URL")

- You can paste in `web3://` URLs, so long as you write `web3 ` ("web3" and then pressing the spacebar) before pasting it in the URL bar.

![Pasting a web3 URL](https://raw.githubusercontent.com/ComfyGummy/chrome-web3/main/img/screencast-pasting-url.gif "Pasting a web3 URL")

## Limitations

This extension abides by the [Manifest v3] extension specification, despite Manifest v3's restrictions against blocking HTTP request interception. This comes with significant limitations relative to a browser with native `web3://` support, such as [evm-browser]. The aim of this Chrome extension should be to act as a bridge for introducing users to the power of `web3://` URLs, in the hope that they are convinced to install a fully-featured browser.

The largest user-visible limitation is that the URL in the address bar starts with `chrome-extension://{EXTENSION_ID}` instead of showing the plain `web3://` URL. This is unfortunately unavoidable within Chrome. However, it may be possible to improve this somewhat by having the main extension frame show a secondary address bar with the `web3://` URL shown in the textbox, and embed the actual `web3://` page in a sub-frame. This "banner"-like textbox could also be a place to advertise the existence of [evm-browser] for a fully-fledged experience.

The web3 pages need to be served in a `chrome-extension` context in order to have access to service workers, as [extension sandbox pages] do not have service worker functionality. However, [`chrome-extension` pages have a restricted `Content-Security-Policy`](https://developer.chrome.com/docs/extensions/mv3/manifest/content_security_policy/#default-policy) which prevents them from loading `<script>` tags coming from non-extension pages, as well as executing inline `<script>` tags. To work around this limitation, the extension needs to rewrite HTML pages to fetch and serve the scripts by itself. This rewriting is brittle and does not work with all methods of loading scripts yet, causing some pages to break.

For the same reason, connecting to web3 wallets (like Metamask) via `window.ethereum` also does not work, because this object is not injected on `chrome-extension` pages. It may be possible to implement this by implementing a shim object that does get injected and that relays commands back and forth using [extension message passing].

Integrating this extension's code within existing browser wallet extensions would also be unwise. This is because this extension executes remotely-fetched JavaScript within a `chrome-extension` context. This is OK because the extension only requests a very limited set of capabilities and tries to mitigate access to the Chrome APIs. Chrome also does a good job to isolate extensions from each other, so even if foreign JavaScript code were to take over the `chrome-extension` origin, the extent of its damage would be limited. However, a web3 wallet extension needs a lot more permissions to function, so it would be unsafe to use this technique within other wallet extensions as they stand.

## How it works

With [Manifest v3], Google has rescinded support for the `webRequestBlocking` permission. This would have been the perfect API to intercept HTTP gateway requests and implement an extension that way, but this API is no longer available in [Manifest v3]. So this extension does the next best thing.

The extension works by creating an [extension service worker] that listens for requests on its `chrome-extension://{EXTENSION_ID}` endpoint. Additionally, it uses the [`declarativeNetRequest` API][declarativeNetRequest] with `redirect` rules in order to redirect traffic to w3link gateways and its own fictitious `*.web3` gateway to its own `chrome-extension://{EXTENSION_ID}` endpoint.

When receiving a request, the extension performs a web3 fetch request using the [`web3protocol` library][web3protocol library]. It then inspects the mime-type and the body of the response to see if it looks like HTML. If it does, it rewrites several parts of the HTML in order to make it work within a `chrome-extension` page context. Specifically:

- A `<base href="https://{CONTRACT_ADDRESS}.web3:{CHAIN_ID}/{PATH}" />` tag is added in the `<head>` of the page. This is necessary in order to make all relative and absolute URLs in other parts of the page (`<img>` tags, `<a>` links, etc) point to the right location, rather than the `chrome-extension` page. Since requests to the fictitious `*.web3` TLD are redirected back to the extension, this does not cause any requests or DNS lookups to leak onto the network.
- All `<link>` URLs that are not stylesheets are deleted. This prevents errors from script preloading, which would fail the `Content-Security-Policy` directive of `chrome-extension` pages.
- All `<script>` tags are rewritten. There are two types of `<script>` tags:
  - **Scripts that import code from other URLs** (`<script src="{SCRIPT_URL}"></script>`): Since the `Content-Security-Policy` of Chrome extension pages does not allow fetching external scripts, the `src` attribute gets rewritten to `chrome-extension://{EXTENSION_ID}/web3scripturl://{base64(SCRIPT_URL)}`. The extension service worker knows to handle requests starting with `web3scripturl://` as requests for fetching remote JavaScript code.
  - **Inline scripts** (`<script>{SCRIPT_CODE}</script>`): Since the `Content-Security-Policy` of Chrome extension pages does not allow executing inline scripts, the `{SCRIPT_CODE}` section of the `<script>` tag is removed, and instead the `<script>` tag is rewritten as `<script src="chrome-extension://{EXTENSION_ID}/web3scriptinline://{base64(SCRIPT_CODE)}"></script>`. The extension service worker knows to handle requests starting with `web3scriptinline://` as requests for serving inline JavaScript code.
- A `<script>` tag is added before all other `<script>` tags, which resolves some incompatibilities due to being served from a `chrome-extension` origin. This also takes care of rewriting the URLs of deferred loading of future scripts.

The extension also adds "web3" as an [omnibox keyword]. This allows users to interact with it by typing "web3" and then pressing the spacebar in the browser's address bar. This enables the user to type or paste in `web3://` URLs in the address bar, albeit with the extra burden of activating the omnibox keyword.

## How to install

This extension is not yet code-reviewed, and it still fails to display some `web3://` sites properly. Until this is fixed, it will not be available on the Chrome web store.

## How to compile

The extension uses TypeScript for its service worker, Webpack for compiling it all, and Yarn as a build and package management tool.

On Debian:

```shell
# Install Yarn as per https://classic.yarnpkg.com/lang/en/docs/install/#debian-stable
$ curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
$ echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list
$ sudo apt update && sudo apt install yarn
$ yarn --version
1.22.19

# Install Node.js v20 as per https://github.com/nodesource/distributions#using-debian-as-root
# Warning: this executes a shell script as root from deb.nodesource.com!
$ curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt-get install -y nodejs
$ node --version
v20.4.0

# Check out this repository.
$ git clone --recursive https://github.com/ComfyGummy/chrome-web3
$ cd chrome-web3

# Install dependencies via yarn.
$ yarn install --frozen-lockfile

# Build:
$ yarn build
```

If you have followed these instructions, the Chrome extension files are now in the `dist` subdirectory of the repository. You can load it into Chrome by enabling developer mode, then click "Load unpacked" and browse to the `dist` subdirectory.

![Loading the unpacked extension](https://raw.githubusercontent.com/ComfyGummy/chrome-web3/main/img/screencast-extension-install.gif "Loading the unpacked extension")

Now browse to `https://w3url.w3eth.io/` and see what happens.

## Future work

Things that could be improved about the extension:

- Allow the user to customize the RPC endpoint used by the extension.
- Get Chrome to add `web3://` to the list of URL schemes that it allows extensions to register as a handler for. `ipfs://` is currently one of these schemes. As an IANA-registered URL scheme, it should be possible to add `web3://` to this list.
- Implement automated internal retries. Currently, some requests randomly fail with "execution reverted" error messages. This could be handled in the [`web3protocol` library][web3protocol library] as well.
- Implement light client support, rather than contacting EVM RPC endpoints. This may be possible using [Helios] compiled to WebAssembly, which is supported in Chrome extensions.
- Implement favicon support.
- Add configuration to disable websites from using non-`web3://` URLs (external JavaScript). `web3://` websites should not depend on web2 CDNs serving mutable JavaScript code. Pre-bake popular JavaScript into the extension so that they don't need to be loaded from the chain all the time.
- Implement better caching mechanism. Right now the extension hard-codes a 30 minute caching buffer in order to improve page loading speed over the more correct `no-cache` setting. This may not be appropriate for all use-cases. The ERC-4804 spec needs a mechanism to specify the equivalent of the HTTP `Cache-Control` header. This could be done in a similar manner as [ERC-7087].
- Figure out whether it is possible to port the service worker into a [sandbox context][extension sandbox pages].
- Add support for injecting `window.ethereum` into the `chrome-extension` page context. When the page attempts to use it, display some message telling the user to use WalletConnect instead.

## Acknowledgments

[ERC-4804] and the `web3://` URL scheme was designed by [Dr. Qi Zhou] and [EthStorage].

The heavy lifting of actually querying the EVM is done by the [`web3protocol` library][web3protocol library] written by [nand2].

## License

This extension is released under the MIT license.

[ERC-4804]: https://eips.ethereum.org/EIPS/eip-4804
[ERC-7087]: https://github.com/ethereum/EIPs/pull/7087
[Manifest v3]: https://developer.chrome.com/docs/extensions/mv3/intro/mv3-overview/
[evm-browser]: https://github.com/nand2/evm-browser
[extension service worker]: https://developer.chrome.com/docs/extensions/mv3/service_workers/
[declarativeNetRequest]: https://developer.chrome.com/docs/extensions/reference/declarativeNetRequest
[extension sandbox pages]: https://developer.chrome.com/docs/extensions/mv3/manifest/sandbox/
[extension message passing]: https://developer.chrome.com/docs/extensions/mv3/messaging/
[web3protocol library]: https://github.com/nand2/web3protocol
[omnibox keyword]: https://developer.chrome.com/docs/extensions/reference/omnibox/
[Helios]: https://github.com/a16z/helios
[Dr. Qi Zhou]: https://twitter.com/qc_qizhou
[EthStorage]: https://ethstorage.io/
[nand2]: https://github.com/nand2
