# Betwixt

This tool will help you analyze web traffic outside the browser using familiar Chrome DevTools interface.

![Betwixt in action](http://i.imgur.com/ccgmL2C.gif)

## Installing

Download the [latest release](https://github.com/kdzwinel/betwixt/releases/latest) for your operating system, [build your own bundle](docs/building.md) or [run Betwixt from the source code](docs/building.md).

## Setting up

In order to capture traffic, you'll have to direct it to the proxy created by Betwixt in the background (`http://localhost:8008`).

If you wish to analyze traffic system wide:
- on OS X - `System Preferences → Network → Advanced → Proxies → Web Proxy (HTTP)`
- on Ubuntu - `All Settings → Network → Network Proxy`
- on Windows - `Settings → Network & Internet → Proxy`

![Setting up proxy on Windows 10 and OS X](http://i.imgur.com/ZVldO35.png)

If you want to capture traffic coming from a single terminal use `export http_proxy=http://localhost:8008`.

Capturing encrypted traffic (HTTPS) requires additional step, see [this doc](docs/https.md) for instructions.

## Contributing

All contributors are very welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) fore more details.

#### License [MIT](LICENSE.md)
