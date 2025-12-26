# 3D_editor

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```

### Author

@cinhoChou Guangzhou University

### 目录结构

Ctrl+Shift+P然后输入Project Tree生成目录结构（每次都会加入）

```
3D_editor
├─ .editorconfig
├─ .prettierrc.json
├─ env.d.ts
├─ eslint.config.ts
├─ index.html
├─ package-lock.json
├─ package.json
├─ public
│  └─ favicon.ico
├─ README.md
├─ src
│  ├─ App.vue
│  ├─ assets
│  ├─ components
│  │  ├─ SideBar.vue
│  │  ├─ TimeLine.vue
│  │  └─ ToolBar.vue
│  ├─ core
│  │  ├─ behavior
│  │  ├─ constraints
│  │  ├─ editor
│  │  │  ├─ Command.ts
│  │  │  ├─ Editor.ts
│  │  │  └─ TransformCommand.ts
│  │  ├─ geometry
│  │  │  ├─ Line3.ts
│  │  │  ├─ Plane.ts
│  │  │  ├─ Point3.ts
│  │  │  └─ Vec3.ts
│  │  └─ scene
│  │     └─ Scene.ts
│  ├─ main.ts
│  ├─ renderer
│  │  ├─ Interaction.ts
│  │  ├─ ObjectMapper.ts
│  │  └─ ThreeRenderer.ts
│  ├─ router
│  │  └─ index.ts
│  ├─ store
│  │  ├─ sceneStore.ts
│  │  └─ uiStore.ts
│  ├─ styles
│  ├─ utils
│  └─ views
│     └─ EditorView.vue
├─ tsconfig.app.json
├─ tsconfig.json
├─ tsconfig.node.json
└─ vite.config.ts

```
