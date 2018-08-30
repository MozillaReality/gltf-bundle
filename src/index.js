const path = require("path");
const glob = require("glob-promise");
const fs = require("fs-extra");
const fbx2gltf = require("@robertlong/fbx2gltf");
const { ConvertGLBtoGltf } = require("gltf-import-export");
const addComponentData = require("gltf-component-data");
const generateUnlitTextures = require("gltf-unlit-generator");
const { contentHashUrls, contentHashAndCopy } = require("gltf-content-hash");
var Ajv = require("ajv");

module.exports.createBundle = async function createBundle(
  config,
  configDir,
  destPath
) {
  const schema = await fs.readJson(
    path.join(__dirname, "..", "schema", "gltf-bundle-config.json")
  );

  const ajv = new Ajv();
  ajv.addMetaSchema(require("ajv/lib/refs/json-schema-draft-06.json"));
  const valid = ajv.validate(schema, config);
  if (!valid) {
    const message = ajv.errors.map(e => "  " + e.message).join("\n");
    throw `Bundle config invalid:\n${message}`;
  }

  let absoluteDestPath = path.resolve(destPath);

  if (config.output && config.output.filePath) {
    absoluteDestPath = path.join(absoluteDestPath, config.output.filePath);
  }

  const bundle = {
    name: config.name,
    version: config.version,
    meta: config.meta,
    assets: []
  };

  if (bundle.meta && bundle.meta.images) {
    for (const image of bundle.meta.images) {
      image.srcset = await contentHashAndCopy(
        path.resolve(configDir, image.srcset),
        absoluteDestPath
      );
    }
  }

  for (const asset of config.assets) {
    // Convert the src asset to .gltf and write all resulting files to destPath.
    const destGltfPath = await convertGltf(asset, configDir, absoluteDestPath);

    const unlitGeneratorConfig = asset["gltf-unlit-generator"] || {};

    if (!unlitGeneratorConfig.skip) {
      // Generate unlit textures for gltf. Writes changes to .gltf file
      await generateUnlitTextures(
        destGltfPath,
        absoluteDestPath,
        unlitGeneratorConfig
      );
    }

    // Read the resulting gltf file.
    let gltf = await fs.readJson(destGltfPath);

    // Add component data to gltf.
    if (asset.components) {
      for (const componentObjOrUrl of asset.components) {
        const componentData = await getComponentData(
          configDir,
          componentObjOrUrl
        );
        gltf = addComponentData(gltf, componentData);
      }
    }

    await fs.remove(destGltfPath);

    const {
      fileName: hashedGltfFileName,
      gltf: hashedGltf
    } = await contentHashUrls(destGltfPath, gltf, { rename: true });

    // TODO: FBX2glTF doesn't always remove the .fbm directory. Ensure it is deleted before continuing.
    const fbmDirectories = await glob(path.join(absoluteDestPath, "*.fbm/"));
    for (const fbmDirectory of fbmDirectories) {
      await fs.remove(fbmDirectory);
    }

    await fs.writeJson(
      path.join(absoluteDestPath, hashedGltfFileName),
      hashedGltf
    );

    const bundledAsset = {
      name: asset.name,
      src: hashedGltfFileName
    };

    if (asset.type) {
      bundledAsset.type = asset.type;
    }

    bundle.assets.push(bundledAsset);
  }

  const bundlePath = path.join(absoluteDestPath, config.name + ".bundle.json");
  const versionedBundlePath = path.join(
    absoluteDestPath,
    config.name + "-" + config.version + "-" + Date.now() + ".bundle.json"
  );

  await fs.writeJson(bundlePath, bundle);
  await fs.writeJson(versionedBundlePath, bundle);

  return [bundlePath, versionedBundlePath];
};

module.exports.createFromBundleConfig = async function createFromBundleConfig(
  configPath,
  destPath
) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`config file: ${configPath} does not exist`);
  }

  let absoluteDestPath = path.resolve(destPath);

  const config = await fs.readJson(configPath);

  const configDir = path.dirname(configPath);

  return module.exports.createBundle(config, configDir, destPath);
};

async function getComponentData(configDir, componentObjOrUrl) {
  if (typeof componentObjOrUrl === "string") {
    return await fs.readJson(path.join(configDir, componentObjOrUrl));
  } else {
    return componentObjOrUrl;
  }
}

async function convertGltf(asset, configDir, destPath) {
  const srcPath = path.resolve(configDir, asset.src);
  const { ext, name } = path.parse(srcPath);
  const destGltfPath = path.join(destPath, name + ".gltf");

  await fs.ensureDir(destPath);

  switch (ext) {
    case ".fbx":
      const args = (asset["FBX2glTF"] && asset["FBX2glTF"].args) || [];
      try {
        const fbxDestPath = await fbx2gltf(srcPath, destGltfPath, args);
        // TODO: Hack for FBX2glTF. When exporting as .gltf, destPath  is actually destPath + fileName + "_out"
        // https://github.com/facebookincubator/FBX2glTF/issues/91
        await fs.move(path.join(destPath, name + "_out"), destPath);
      } catch (e) {
        console.error(`Error in FBX2glTF converting file: ${srcPath}`);
        throw e;
      }

      break;
    case ".gltf":
      await copyGltfFiles(srcPath, destPath);
      break;
    case ".glb":
      ConvertGLBtoGltf(srcPath, destGltfPath);
      break;
    default:
      throw `src: ${srcPath} is invalid. Extension: ${ext} is not supported`;
  }

  return destGltfPath;
}

// Move files from src directory to dest directory (not recursive).
// fs-extra's fs.move() method was failing when called on the src directory, so we move files directly.
async function move(src, dest) {
  const files = await fs.readdir(src);

  for (const file of files) {
    await fs.move(path.join(src, file), path.join(dest, file), {
      overwrite: true
    });
  }

  await fs.rmdir(src);
}

async function copyGltfFiles(gltfPath, destPath) {
  const gltf = await fs.readJson(gltfPath);
  const { dir: gltfDir, base: gltfName } = path.parse(gltfPath);

  if (gltf.buffers) {
    for (const buffer of gltf.buffers) {
      await copyFromUri(gltfDir, destPath, buffer.uri);
    }
  }

  if (gltf.images) {
    for (const image of gltf.images) {
      await copyFromUri(gltfDir, destPath, image.uri);
    }
  }

  const destGltfPath = path.join(destPath, gltfName);

  // Copy .gltf file itself
  await fs.copy(gltfPath, destGltfPath, { overwrite: true });
}

async function copyFromUri(gltfDir, destPath, uri) {
  // Don't process data uri's
  if (uri.startsWith("data:")) {
    return;
  }

  // URI's must be relative to the gltf file as per the glTF 2.0 spec
  // Copy the file to the relative path, creating directories as necessary.
  await fs.copy(path.join(gltfDir, uri), path.join(destPath, uri), {
    overwrite: true
  });
}
