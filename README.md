# WriteStreak

A gamified terminal writing app. Track your daily writing streaks, earn XP, level up, and build momentum.

## Install

Requires [Bun](https://bun.sh) runtime.

```bash
curl -fsSL https://bun.sh/install | bash && bun install -g github:nd28/writestreak
```

## Usage

```bash
writestreak              # launch
writestreak --skip-guide # skip first-time guide
writestreak --color #E8A0BF # theme with primary color
ws                       # short alias
```

## Features

- Daily writing sessions with streak tracking
- XP and leveling system (12 levels)
- Session history with export (MessagePack)
- In-app insights panel
- Mouse support
- Theming with custom primary color
