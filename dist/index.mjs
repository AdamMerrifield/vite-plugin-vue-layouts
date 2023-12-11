// src/index.ts
import { resolve } from "path";

// src/clientSide.ts
import { posix } from "path";
import { getPackageInfo } from "local-pkg";
function normalizePath(path) {
  path = path.startsWith("/") ? path : `/${path}`;
  return posix.normalize(path);
}
async function isVite2() {
  const info = await getPackageInfo("vite");
  if (info)
    return /.?2/.test(info.version);
  return false;
}
async function createVirtualGlob(target, isSync) {
  const g = `"${target}/**/*.vue"`;
  if (await isVite2())
    return isSync ? `import.meta.globEager(${g})` : `import.meta.glob(${g})`;
  return `import.meta.glob(${g}, { eager: ${isSync} })`;
}
async function createVirtualModuleCode(options) {
  const { layoutDir, defaultLayout, importMode } = options;
  const normalizedTarget = normalizePath(layoutDir);
  const isSync = importMode === "sync";
  return `
  export const createGetRoutes = (router, withLayout = false) => {
      const routes = router.getRoutes()
      if (withLayout) {
          return routes
      }
      return () => routes.filter(route => !route.meta.isLayout)
  }
  
  export const setupLayouts = routes => {
      const layouts = {}
  
      const modules = ${await createVirtualGlob(normalizedTarget, isSync)}
    
      Object.entries(modules).forEach(([name, module]) => {
          let key = name.replace("${normalizedTarget}/", '').replace('.vue', '')
          layouts[key] = ${isSync ? "module.default" : "module"}
      })
      
    function deepSetupLayout(routes, top = true) {
      return routes.map(route => {
        if (route.children?.length > 0) {
          route.children = deepSetupLayout(route.children, false)
        }
        
        if (top && route.meta?.layout !== false) {
          return { 
            path: route.path,
            component: layouts[route.meta?.layout || '${defaultLayout}'],
            children: [ {...route, path: ''} ],
            meta: {
              isLayout: true
            }
          }
        }
  
        if (route.meta?.layout) {
          return { 
            path: route.path,
            component: layouts[route.meta?.layout],
            children: [ {...route, path: ''} ],
            meta: {
              isLayout: true
            }
          }
        }
  
        return route
      })
    }
  
      return deepSetupLayout(routes)
  }`;
}

// src/files.ts
import fg from "fast-glob";

// src/utils.ts
import Debug from "debug";
function extensionsToGlob(extensions) {
  return extensions.length > 1 ? `{${extensions.join(",")}}` : extensions[0] || "";
}
function normalizePath2(str) {
  return str.replace(/\\/g, "/");
}
var debug = Debug("vite-plugin-layouts");

// src/files.ts
async function getFilesFromPath(path, options) {
  const {
    exclude,
    extensions
  } = options;
  const ext = extensionsToGlob(extensions);
  debug(extensions);
  const files = await fg(`**/*.${ext}`, {
    ignore: ["node_modules", ".git", "**/__*__/*", ...exclude],
    onlyFiles: true,
    cwd: path
  });
  return files;
}

// src/importCode.ts
import { join, parse } from "path";
function getImportCode(files, options) {
  const imports = [];
  const head = [];
  let id = 0;
  for (const __ of files) {
    for (const file of __.files) {
      const path = __.path.substr(0, 1) === "/" ? `${__.path}/${file}` : `/${__.path}/${file}`;
      const parsed = parse(file);
      const name = join(parsed.dir, parsed.name).replace(/\\/g, "/");
      if (options.importMode(name) === "sync") {
        const variable = `__layout_${id}`;
        head.push(`import ${variable} from '${path}'`);
        imports.push(`'${name}': ${variable},`);
        id += 1;
      } else {
        imports.push(`'${name}': () => import('${path}'),`);
      }
    }
  }
  const importsCode = `
${head.join("\n")}
export const layouts = {
${imports.join("\n")}
}`;
  return importsCode;
}

// src/RouteLayout.ts
function getClientCode(importCode, options) {
  const code = `
${importCode}

export function setupLayouts(routes) {
  function deepSetupLayout(routes) {
    return routes.map(route => {
      if (route.children?.length > 0) {
        return { ...route, children: deepSetupLayout(route.children) }
      }
      const isBoolean = typeof route.meta?.layout === 'boolean'
      if(isBoolean && !route.meta?.layout) {
        return route
      }
      const componentName = !isBoolean && route.meta?.layout ? route.meta?.layout : '${options.defaultLayout}'
      return {
        path: route.path,
        component: layouts[componentName],
        children: route.path === '/' ? [route] : [{...route, path: ''}]
      }
    })
  }

  return deepSetupLayout(routes)
}
`;
  return code;
}
var RouteLayout_default = getClientCode;

// src/index.ts
var MODULE_IDS = ["layouts-generated", "virtual:generated-layouts"];
var MODULE_ID_VIRTUAL = "/@vite-plugin-vue-layouts/generated-layouts";
function defaultImportMode(name) {
  if (process.env.VITE_SSG)
    return "sync";
  return name === "default" ? "sync" : "async";
}
function resolveOptions(userOptions) {
  return Object.assign({
    defaultLayout: "default",
    layoutsDirs: "src/layouts",
    extensions: ["vue"],
    exclude: [],
    importMode: defaultImportMode
  }, userOptions);
}
function Layout(userOptions = {}) {
  let config;
  const options = resolveOptions(userOptions);
  return {
    name: "vite-plugin-vue-layouts",
    enforce: "pre",
    configResolved(_config) {
      config = _config;
    },
    configureServer({ moduleGraph, watcher, ws }) {
      watcher.add(options.layoutsDirs);
      const reloadModule = (module, path = "*") => {
        if (module) {
          moduleGraph.invalidateModule(module);
          if (ws) {
            ws.send({
              path,
              type: "full-reload"
            });
          }
        }
      };
      const updateVirtualModule = () => {
        const module = moduleGraph.getModuleById(MODULE_ID_VIRTUAL);
        reloadModule(module);
      };
      watcher.on("add", () => {
        updateVirtualModule();
      });
      watcher.on("unlink", () => {
        updateVirtualModule();
      });
      watcher.on("change", async (path) => {
        path = `/${normalizePath2(path)}`;
        const module = await moduleGraph.getModuleByUrl(path);
        reloadModule(module, path);
      });
    },
    resolveId(id) {
      return MODULE_IDS.includes(id) || MODULE_IDS.some((i) => id.startsWith(i)) ? MODULE_ID_VIRTUAL : null;
    },
    async load(id) {
      if (id === MODULE_ID_VIRTUAL) {
        const layoutDirs = Array.isArray(options.layoutsDirs) ? options.layoutsDirs : [options.layoutsDirs];
        const container = [];
        for (const dir of layoutDirs) {
          const layoutsDirPath = dir.substr(0, 1) === "/" ? normalizePath2(dir) : normalizePath2(resolve(config.root, dir));
          debug("Loading Layout Dir: %O", layoutsDirPath);
          const _f = await getFilesFromPath(layoutsDirPath, options);
          container.push({ path: layoutsDirPath, files: _f });
        }
        const importCode = getImportCode(container, options);
        const clientCode = RouteLayout_default(importCode, options);
        debug("Client code: %O", clientCode);
        return clientCode;
      }
    }
  };
}
function ClientSideLayout(options) {
  const {
    layoutDir = "src/layouts",
    defaultLayout = "default",
    importMode = process.env.VITE_SSG ? "sync" : "async"
  } = options || {};
  return {
    name: "vite-plugin-vue-layouts",
    resolveId(id) {
      return MODULE_IDS.includes(id) || MODULE_IDS.some((i) => id.startsWith(i)) ? MODULE_ID_VIRTUAL : null;
    },
    async load(id) {
      if (id === MODULE_ID_VIRTUAL) {
        return createVirtualModuleCode({
          layoutDir,
          importMode,
          defaultLayout
        });
      }
    }
  };
}
export {
  ClientSideLayout,
  Layout as default,
  defaultImportMode
};
