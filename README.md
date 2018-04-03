# gltf-bundle

## Installation

Install [rust](https://www.rust-lang.org/install.html) and [node.js](https://nodejs.org/).

```
cargo install gltf_unlit_generator
npm install -g gltf-bundle
```

## Usage


```
Usage: gltf-bundle [configPath]

  Options:

    -V, --version   output the version number
    -o --out <out>  Bundle output path (required).
    -h, --help      output usage information

  Examples:
    1. Search all subdirectories for *.bundle.config.json files and output bundles
    in out dir.

    $ gltf-bundle -o ./out

    2. Specify a bundle config file and output to the out directory.

    $ gltf-bundle ./avatar.bundle.config.json -o ./out
```