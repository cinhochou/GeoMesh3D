# GeoMesh3D

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

### Start Collaboration Server

```sh
npm run collab-server
```

The collaboration layer now uses `y-websocket` instead of `y-webrtc` signaling.

- Default server address: `ws://localhost:1234`
- Fallback server address: `wss://kraig-scarabaeiform-zealously.ngrok-free.dev`
- Client override: set `VITE_COLLAB_WS_URL`
- Server override in PowerShell: `$env:HOST='0.0.0.0'; $env:PORT='1234'; npm run collab-server`

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```

### Authors and Statement

@cinhoChou Guangzhou University
Contact me: <2974166992@qq.com>
Unauthorized use for any purpose is prohibited.

### 目录结构

The project was created on December 25, 2025 at 17:55.
Ctrl+Shift+P然后输入Project Tree生成目录结构（每次都会加入）

```
GeoMesh3D
├─ .editorconfig
├─ .prettierrc.json
├─ .uploads
├─ CodingPlan.txt
├─ env.d.ts
├─ eslint.config.ts
├─ index.html
├─ package-lock.json
├─ package.json
├─ public
│  ├─ arcode
│  │  ├─ marker89.td
│  │  └─ myTraining.patt
│  ├─ data
│  │  └─ camera_para.dat
│  ├─ favicon.ico
│  └─ GeoMesh3D_logo_black_260x260.png
├─ README.md
├─ scripts
│  └─ y-websocket-server.mjs
├─ src
│  ├─ api
│  │  ├─ auth.ts
│  │  ├─ client.ts
│  │  └─ user.ts
│  ├─ App.vue
│  ├─ assets
│  │  └─ GeoMesh3D_logo_white_1240x300.png
│  ├─ components
│  │  ├─ InputDialog.vue
│  │  ├─ SettingsPanel.vue
│  │  ├─ SideBar.vue
│  │  ├─ TimeLine.vue
│  │  └─ Toolbar.vue
│  ├─ config
│  │  └─ api.ts
│  ├─ core
│  │  ├─ collab
│  │  │  └─ CollabManager.ts
│  │  ├─ constraints
│  │  │  ├─ CubeConstraint.ts
│  │  │  ├─ CylinderConstraint.ts
│  │  │  ├─ DistanceConstraint.ts
│  │  │  ├─ IntersectionPointConstraint.ts
│  │  │  ├─ ObjectConstrainedPointConstraint.ts
│  │  │  ├─ ParallelLineConstraint.ts
│  │  │  ├─ PerpendicularLineConstraint.ts
│  │  │  ├─ PlanarFaceConstraint.ts
│  │  │  └─ RegularPolygonConstraint.ts
│  │  ├─ editor
│  │  │  ├─ Command.ts
│  │  │  ├─ commands
│  │  │  │  ├─ AbstractUpdateCommand.ts
│  │  │  │  ├─ add
│  │  │  │  │  ├─ AddConeCommand.ts
│  │  │  │  │  ├─ AddConstrainedPointCommand.ts
│  │  │  │  │  ├─ AddCylinderCommand.ts
│  │  │  │  │  ├─ AddElementCommand.ts
│  │  │  │  │  ├─ AddHexahedronCommand.ts
│  │  │  │  │  ├─ AddIntersectionPointCommand.ts
│  │  │  │  │  ├─ AddRadiusSphereCommand.ts
│  │  │  │  │  ├─ AddRegularPolygonCommand.ts
│  │  │  │  │  └─ AddSphereCommand.ts
│  │  │  │  ├─ delete
│  │  │  │  │  ├─ DeleteCircleCommand.ts
│  │  │  │  │  ├─ DeleteConeCommand.ts
│  │  │  │  │  ├─ DeleteCylinderCommand.ts
│  │  │  │  │  ├─ DeleteFaceCommand.ts
│  │  │  │  │  ├─ DeleteHexahedronCommand.ts
│  │  │  │  │  ├─ DeleteLineCommand.ts
│  │  │  │  │  ├─ DeleteParallelLineCommand.ts
│  │  │  │  │  ├─ DeletePerpendicularLineCommand.ts
│  │  │  │  │  ├─ DeletePointCommand.ts
│  │  │  │  │  ├─ DeleteRadiusSphereCommand.ts
│  │  │  │  │  ├─ DeleteRayCommand.ts
│  │  │  │  │  ├─ DeleteRegularPolygonCommand.ts
│  │  │  │  │  ├─ DeleteSphereCommand.ts
│  │  │  │  │  ├─ DeleteStraightLineCommand.ts
│  │  │  │  │  └─ DeleteVectorCommand.ts
│  │  │  │  ├─ scene
│  │  │  │  │  ├─ ClearSceneCommand.ts
│  │  │  │  │  ├─ MergeCubePointsCommand.ts
│  │  │  │  │  ├─ MergePointsCommand.ts
│  │  │  │  │  ├─ SyncLockStateCommand.ts
│  │  │  │  │  ├─ TransformCommand.ts
│  │  │  │  │  └─ TransformPointsCommand.ts
│  │  │  │  └─ update
│  │  │  │     ├─ UpdateCircleCommand.ts
│  │  │  │     ├─ UpdateConeCommand.ts
│  │  │  │     ├─ UpdateConeHeightCommand.ts
│  │  │  │     ├─ UpdateConeRadiusCommand.ts
│  │  │  │     ├─ UpdateCubeCommand.ts
│  │  │  │     ├─ UpdateCylinderCommand.ts
│  │  │  │     ├─ UpdateCylinderHeightCommand.ts
│  │  │  │     ├─ UpdateCylinderRadiusCommand.ts
│  │  │  │     ├─ UpdateFaceCommand.ts
│  │  │  │     ├─ UpdateLineCommand.ts
│  │  │  │     ├─ UpdateParallelLineCommand.ts
│  │  │  │     ├─ UpdatePerpendicularLineCommand.ts
│  │  │  │     ├─ UpdatePointCommand.ts
│  │  │  │     ├─ UpdateRayCommand.ts
│  │  │  │     ├─ UpdateRegularPolygonCommand.ts
│  │  │  │     ├─ UpdateSphereCommand.ts
│  │  │  │     ├─ UpdateSphereRadiusCommand.ts
│  │  │  │     ├─ UpdateStraightLineCommand.ts
│  │  │  │     └─ UpdateVectorCommand.ts
│  │  │  ├─ Editor.ts
│  │  │  ├─ editorSession.ts
│  │  │  └─ SceneSerializer.ts
│  │  ├─ geometry
│  │  │  ├─ Circle3.ts
│  │  │  ├─ Cone3.ts
│  │  │  ├─ Cylinder3.ts
│  │  │  ├─ GeoVector3.ts
│  │  │  ├─ IntersectionPoint3.ts
│  │  │  ├─ Line3.ts
│  │  │  ├─ ParallelLine3.ts
│  │  │  ├─ PerpendicularLine3.ts
│  │  │  ├─ PlanarPolygon.ts
│  │  │  ├─ PlanarUtils.ts
│  │  │  ├─ Point3.ts
│  │  │  ├─ Ray3.ts
│  │  │  ├─ Sphere3.ts
│  │  │  ├─ StraightLine3.ts
│  │  │  └─ Vec3.ts
│  │  ├─ perf
│  │  │  └─ solverScheduler.worker.ts
│  │  └─ scene
│  │     ├─ Scene.ts
│  │     └─ Selection.ts
│  ├─ main.ts
│  ├─ renderer
│  │  ├─ ARManager.ts
│  │  ├─ AxisGridManager.ts
│  │  ├─ GeometrySyncer.ts
│  │  ├─ Interaction.ts
│  │  ├─ LabelRenderer.ts
│  │  ├─ ObjectMapper.ts
│  │  └─ ThreeRenderer.ts
│  ├─ resources
│  │  ├─ build
│  │  │  ├─ ar.js
│  │  │  ├─ GLTFLoader.js
│  │  │  ├─ MTLLoader.js
│  │  │  ├─ OBJLoader.js
│  │  │  ├─ OBJMTLLoader.js
│  │  │  ├─ OrbitControls.js
│  │  │  ├─ stats.js
│  │  │  ├─ three.js
│  │  │  ├─ three.min.js
│  │  │  └─ threex-arbasecontrols.js
│  │  └─ pdf
│  │     ├─ marker89.pdf
│  │     └─ myTraining_Marker.pdf
│  ├─ router
│  │  └─ index.ts
│  ├─ store
│  │  ├─ authStore.ts
│  │  ├─ collabStore.ts
│  │  ├─ sceneStore.ts
│  │  └─ uiStore.ts
│  ├─ styles.css
│  ├─ types
│  │  ├─ api-service-auth.ts
│  │  ├─ api-service-user.ts
│  │  ├─ api.ts
│  │  └─ user.ts
│  └─ views
│     ├─ EditorView.vue
│     ├─ LoginView.vue
│     └─ RegisterView.vue
├─ tsconfig.app.json
├─ tsconfig.json
├─ tsconfig.node.json
└─ vite.config.ts

```
