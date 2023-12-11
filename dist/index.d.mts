import { Plugin } from 'vite';

/**
 * Plugin options.
 */
interface Options {
    /**
     * Relative path to the directory to search for page components.
     * @default 'src/layouts'
     */
    layoutsDirs: string | string[];
    /**
     * Valid file extensions for page components.
     * @default ['vue']
     */
    extensions: string[];
    /**
     * List of path globs to exclude when resolving pages.
     */
    exclude: string[];
    /**
     * Filename of default layout (".vue" is not needed)
     * @default 'default'
     */
    defaultLayout: string;
    /**
     * Mode for importing layouts
     */
    importMode: (name: string) => 'sync' | 'async';
}
declare type FileContainer = {
    path: string;
    files: string[];
};
declare type UserOptions = Partial<Options>;
interface ResolvedOptions extends Options {
}
interface clientSideOptions {
    /**
     * layouts dir
     * @default "src/layouts"
     */
    layoutDir?: string;
    /**
     * default layout
     * @default "default"
     */
    defaultLayout?: string;
    /**
     * default auto resolve
     */
    importMode: 'sync' | 'async';
}

declare function defaultImportMode(name: string): "sync" | "async";
declare function Layout(userOptions?: UserOptions): Plugin;
declare function ClientSideLayout(options?: clientSideOptions): Plugin;

export { ClientSideLayout, FileContainer, ResolvedOptions, UserOptions, clientSideOptions, Layout as default, defaultImportMode };
