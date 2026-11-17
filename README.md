# SNAKE//SHIFT

A browser Snake game with changing worlds, retro visuals and electronic music. Eat dots, grow your snake and survive as the game moves between 2D boards and 3D worlds.

**[Play the game](https://snake.online-tichu.com)**

## Why it is lightweight

The game uses plain JavaScript with no frontend framework or external runtime dependencies. Canvas and WebGL draw the worlds from code, while Web Audio generates the music and sound effects. That keeps downloads small: there are no large graphics or audio packs to load. It also lowers rendering resolution when frames slow down, reducing the graphics workload.

## Contribute

New levels, game mechanics, visual styles, sounds and bug fixes are welcome.

1. Open an issue to discuss a new level or a larger gameplay change.
2. Fork the repository and make your changes on a branch.
3. Open a pull request explaining what you changed and how you tested it.

**Grillmeister5415 maintains the project and decides what gets merged into the official game.** A contribution is a proposal, not a promise that it will be included. Contributors work in their own forks and do not receive direct write access to this repository.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the short contribution guide.

## Run locally

Use Node.js 20 or newer:

```sh
cd snake-shift
npm start
```

Open http://localhost:4321. Run tests with `npm test` from the same folder.

No build step is needed. Reduced flash, reduced motion and calmer sound options are available.

[Game controls and technical details](snake-shift/README.md)

## Licence

[MIT](LICENSE). You can make your own version under this licence; changes to this repository still need the maintainer's approval.
