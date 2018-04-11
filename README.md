# gltf-bundle

gltf-bundle is a command line tool and nodejs library that creates [glTF](https://github.com/khronosgroup/gltf) files that are optimized for distribution on the web.

## Installation

Install [rust](https://www.rust-lang.org/install.html) and [node.js](https://nodejs.org/).

```
cargo install gltf_unlit_generator
npm install -g gltf-bundle
```

## Usage


```
Usage: gltf-bundle [bundleConfigPath]

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

Example `.bundle.config.json` file:

```json
{
  "name": "BotDefault",
  "version": "0.0.1",
  "output": {
    "filePath": "bots"
  },
  "assets": [
    {
      "name": "BotDefault",
      "src": "./BotDefault_Avatar.fbx",
      "components": ["./components.json"]
    }
  ]
}
```

The `name`, `version`, and `assets` properties are required.

`output.filePath` determines the subdirectory to place the bundle and associated files in the `dist/` directory. Files with the same name will be overwritten. This can be useful when assets have textures or binary data in common.

The `asset.src` property can be a `.fbx`, `.gltf`, or `.glb` file. This asset file will have the following build steps applied to it before being placed in the `dist/` folder:

1.  Convert from `.fbx` or `.glb` to `.gltf`. `.fbx`. Conversions are handled by [FBX2glTF](https://github.com/facebookincubator/FBX2glTF).
2.  Generate unlit textures and add the `MOZ_alt_material` extension to any materials in the `.gltf` file using [gltf-unlit-generator](https://github.com/MozillaReality/gltf-unlit-generator).
3.  Add component data using [gltf-component-data](https://github.com/MozillaReality/gltf-component-data) to `gltf.node.extras` using the supplied `asset.components` array. The `components` array can include paths to json files containing component data or JSON objects containing component data.

    Example component.json:

    ```json
    {
      "scenes": {
        "Root Scene": {
          "loop-animation": {
            "clip": "idle_eyes"
          }
        }
      },
      "nodes": {
        "Head": {
          "scale-audio-feedback": ""
        }
      }
    }
    ```

    Example `.bundle.config.json` file:

    ```json
    {
      "name": "BotDefault",
      "version": "0.0.1",
      "output": {
        "filePath": "bots"
      },
      "assets": [
        {
          "name": "BotDefault",
          "src": "./BotDefault_Avatar.fbx",
          "components": [
            "./components.json",
            {
              "nodes": {
                "Head": {
                  "test-component": true
                }
              }
            }
          ]
        }
      ]
    }
    ```

4.  Using [gltf-content-hash](https://github.com/MozillaReality/gltf-content-hash), rename all referenced assets in the glTF to `<contenthash>.<extension>`. This ensures that cached files referenced in the `.gltf` can be updated. Assets shared between multiple `.gltf` files will have the same content hash and will be fetched from cache rather than downloaded again. `.gltf` files will be renamed to `<gltfName>-<contentHash>.gltf` so that you can easily find and preview gltf files, but still get the same cache busting functionality.
5.  Output two final `.bundle.json` files `<bundle.name>.bundle.json` and `<bundle.name>-<bundle.version>-<timestamp>.bundle.json`. The first bundle will always contain the most recent assets. The second will be a version-locked bundle that you can assume is immutable.
