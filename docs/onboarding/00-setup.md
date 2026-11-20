# 0. Day zero: set up and run it

**Goal:** by the end of this chapter the game runs on your machine, the tests pass, and you know what every command in `package.json` does.

## 0.1 Tools to install

| Tool | What it is | Check it works |
| --- | --- | --- |
| **Git** | Version control: records every change to the code so you can see history and undo mistakes | `git --version` |
| **Node.js** (current LTS, 22 or newer) | Runs JavaScript outside the browser. All the build tools are JavaScript programs, so you need it even though the game runs in a browser | `node -v` |
| **npm** | Comes with Node. Downloads the libraries the project uses (into `node_modules/`) and runs the scripts in `package.json` | `npm -v` |
| **VS Code** | The editor. It understands TypeScript out of the box: hover any name to see its type, Ctrl+click to jump to its definition | |
| **A modern browser** | Chrome, Edge, Firefox or Safari. You will use its DevTools (F12) a lot | |

Useful VS Code habits from day one:

- **Ctrl+P** opens a file by name. Type `engine` and press Enter.
- **Ctrl+click** (Cmd+click on a Mac) on a name jumps to where it is defined. **Alt+←** jumps back.
- **Shift+F12** on a name lists every place it is used.
- **Ctrl+Shift+F** searches the whole project.
- Hovering a name shows its TypeScript type. This is the fastest way to learn the code.

## 0.2 Get the code and run it

```sh
git clone git@github.com:sachinksha/star-hop.git
cd star-hop
npm install      # downloads dependencies into node_modules/ (a minute or two, once)
npm run dev      # starts the dev server, prints a URL such as http://localhost:5173
```

Open the URL. Play a game against a bot. Then:

1. Open the browser's device emulation (DevTools → the phone/tablet icon) and play on a "phone". Notice the big move buttons under the board.
2. Play online with yourself: on the setup screen choose **Online (invite link)**, set one seat to **Online friend**, create the link, and open it in a **private/incognito window**. Each window is now a separate "device".
3. Press **?** in a game to read the rules. You need to know the rules to understand the code.

## 0.3 Every command, explained

These live in the `"scripts"` section of [package.json](../../package.json). `npm run <name>` runs one. `npm test` is a shortcut for `npm run test`.

| Command | What actually runs | What it does | When you use it |
| --- | --- | --- | --- |
| `npm run dev` | `vite` | Starts a local web server that serves the source files directly, converting TypeScript to JavaScript on the fly. Saving a file updates the page instantly (**hot module replacement**, HMR) | All day while coding |
| `npm test` | `vitest run` | Runs all 324 tests once and reports pass/fail | Before every commit |
| `npm run test:watch` | `vitest` | Runs tests, then re-runs the affected ones every time you save | While doing TDD (chapter 10) |
| `npm run build` | `tsc -b && vite build` | **Two steps.** `tsc -b` type-checks every file (and fails on any type error). Only if that passes, `vite build` bundles and minifies everything into `dist/` | Before pushing; Vercel runs this on every deploy |
| `npm run preview` | `vite preview` | Serves the built `dist/` folder locally, so you can test exactly what will be deployed | After a build, to check production behaviour |
| `npm run lint` | `oxlint` | Checks for likely bugs and bad patterns (for example breaking React's rules of hooks) | Before pushing |

> **Important:** `npm run dev` does **not** type-check. Vite strips the types and runs the code, even if the types are wrong, because that keeps it fast. Type errors show up as red squiggles in VS Code and fail `npm run build`. Get into the habit of running `npm run build` (or at least watching VS Code's Problems panel) before you commit.

## 0.4 Running one test

```sh
npx vitest run src/game/rules.test.ts          # one file
npx vitest run -t "bumps an opponent"           # tests whose name matches
npm run test:watch                              # then press 'p' to filter by file name
```

`npx` runs a tool installed in `node_modules/` without needing a script for it.

## 0.5 What's in the folder

```
star-hop/
├── index.html            the one HTML page; it loads src/main.tsx
├── package.json          dependencies and scripts
├── package-lock.json     exact versions of every dependency (commit it, never edit it)
├── vite.config.ts        Vite + Vitest config, and a dev-only /api/turn route
├── tsconfig*.json        TypeScript compiler settings (three files, see chapter 4)
├── .oxlintrc.json        linter rules
├── api/turn.ts           the only server code: a Vercel serverless function
├── public/               copied as-is into the build (favicon)
├── src/                  the app (see chapter 6 for the full tour)
│   ├── main.tsx          entry point: mounts <App/> into the page
│   ├── App.tsx           picks which screen to show
│   ├── game/             the rules: pure TypeScript, no React
│   ├── store/            app state (Zustand stores), saving to localStorage
│   ├── hooks/            React hooks: the game controller, shortcuts, online views
│   ├── components/       React components: board, dice, sheets, screens
│   ├── net/              online play: protocol, host and guest sessions, WebRTC
│   ├── audio/            sound effects synthesised in code
│   └── index.css         all the styles
├── docs/                 the advanced study guide, and this onboarding track
├── README.md             rules of the game, features, architecture summary
├── PLAN.md               the original build plan and rule decisions
└── LEARNINGS.md          house rules in detail and lessons learned
```

Two folders you never edit: `node_modules/` (downloaded by `npm install`) and `dist/` (produced by `npm run build`). Both are listed in `.gitignore`, so Git ignores them.

## 0.6 Optional: online play across networks

Online play works between two windows on one machine without any setup. For phones on mobile data you need a TURN relay (chapter 9). Copy `.env.example` to `.env.local` and fill in one option. `.env.local` is git-ignored, so secrets never get committed.

## 0.7 If something goes wrong

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `vite: command not found` | You haven't installed dependencies | `npm install` |
| Strange errors after pulling new code | Dependencies changed | `npm install` again |
| Port 5173 already in use | Another dev server is running | Close it, or use the other port Vite offers |
| Tests pass locally, build fails | A type error (dev and tests don't type-check) | Read the `tsc` error; fix the type |
| A saved game misbehaves after you changed the rules | Your browser still has an old save | DevTools → Application → Local Storage → delete the `star-hop:*` keys |

## Check yourself

1. Why does the build run `tsc -b` *before* `vite build`?
2. What is the difference between `npm run dev` and `npm run preview`?
3. Which two folders should never be committed, and why?
