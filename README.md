# Vespa Greeter

A small, playable 3D browser game. You ride a vintage scooter along a curvy lakeside
road and return the greeting of oncoming motorcyclists: when a rider raises a hand,
wave back with `SPACE` before you have passed each other. Wave at someone who did not
greet you (a stoic biker, a car, a lorry, a cyclist) and you lose points.

**Play it in your browser: <https://iago-swi.github.io/vespa-greeter/>**

## One brief, several AI assistants

This repository collects versions of the same game, each created with a different AI
assistant from the same brief. Every variant lives in its own folder and is
self-contained, so they can be compared side by side.

| Variant | Folder | Status |
| --- | --- | --- |
| Claude (Anthropic) | [`claude/`](claude/) | Playable |
| ChatGPT (OpenAI) | [`chatgpt/`](chatgpt/) | Not built yet |
| Gemini (Google) | [`gemini/`](gemini/) | Not built yet |

## Running a variant

Each folder has its own `README.md` with instructions. The root `index.html` is a
simple landing page that links to every variant; serve the repository root with any
static web server to use it, for example:

```bash
python -m http.server 5173
```

Then open <http://localhost:5173>.

## The brief

> Create a simple playable 3D game. I'm a vintage Vespa rider who drives on curvy roads
> and has to send hello signs to incoming motorbike riders who send a sign themselves,
> before they have passed. The key to salute is the space bar. When the other rider does
> not make a salute sign, you should not salute, otherwise you get negative points. The
> incoming traffic also includes cars, trucks and bikes. Make it a small map, simple to
> play, with stunning visuals.

## Note

This is a personal fan project. It is not affiliated with or endorsed by Piaggio;
Vespa is a trademark of Piaggio & C. S.p.A.
