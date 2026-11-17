# Contributing to SNAKE//SHIFT

Ideas, new levels, mechanics and fixes are welcome.

## Who decides?

@Grillmeister5415 decides which changes are merged and released in the official game. Opening an issue or pull request does not guarantee acceptance.

For a new level or a substantial gameplay change, open an issue first. Explain the idea and how it would play. Agreeing on the direction before you build it can save time. Small fixes can go straight to a pull request.

## Make a change

1. Fork the repository.
2. Create a branch for one focused change.
3. Run the game from `snake-shift/` with `npm start`.
4. Test your change, then run `npm test` from that folder.
5. Open a pull request against `main`.

Describe what changes for players. Include a screenshot or short video for visual changes, and say how you tested it. Mention anything that is unfinished or needs discussion.

## Keep the game easy to play

- Keep controls responsive and the game lightweight.
- Check keyboard and touch controls where your change affects them.
- Respect reduced flash, reduced motion, calmer sound and mute settings.
- Add or update tests when changing game rules.
- Keep unrelated changes in separate pull requests.
- Use code and assets you have permission to contribute under the project's MIT licence.
- Leave production server configuration alone unless the change has been discussed.

## Review and release

The maintainer may request changes or decide that an idea does not fit the official game. Only the maintainer approves the final merge. Merging code and releasing it to the live site are separate steps.

Contributions are made under the [MIT licence](LICENSE). The maintainer's merge decision applies to this repository and the official game; it does not prevent you from maintaining your own fork.
