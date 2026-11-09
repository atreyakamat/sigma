# Install SIGMA without any technical setup

You need one thing first: **Docker Desktop** (free). Download it from
https://www.docker.com/products/docker-desktop/ , install it, and open it once so it is running
(you will see a whale icon).

## Mac or Linux

1. Open the **Terminal** app.
2. Paste this line and press Enter:
   ```
   curl -fsSL https://raw.githubusercontent.com/atreyakamat/sigma/main/install/install.sh | sh
   ```
3. Wait a few minutes. Your browser opens SIGMA, and the terminal shows your email and password.

## Windows

1. Open **PowerShell** (press Start, type "PowerShell", press Enter).
2. Paste this line and press Enter:
   ```
   irm https://raw.githubusercontent.com/atreyakamat/sigma/main/install/install.ps1 | iex
   ```
3. Wait a few minutes. Your browser opens SIGMA, and the window shows your email and password.

## After installing

Everything lives in a folder called `sigma` in your home folder:

| File                            | What it does                                           |
| ------------------------------- | ------------------------------------------------------ |
| `SIGMA-LOGIN.txt`               | Your address, email and password                       |
| `start-sigma` / `Start SIGMA`   | Double-click to start SIGMA and open it in the browser |
| `stop-sigma` / `Stop SIGMA`     | Stops SIGMA. Your designs are kept                     |
| `update-sigma` / `Update SIGMA` | Downloads the newest version                           |
| `backup-sigma` (Mac/Linux)      | Saves a copy of all designs and images into `backups/` |

SIGMA also starts by itself whenever Docker Desktop starts.

## Add your team

Sign in, open the menu with your name (top right) → **Users** → **New user**. Give each person the
email and temporary password SIGMA shows you. To let people on other computers reach it, they open
`http://<your-computer-name>:3387` on the same network; for access over the internet see
`docs/OPERATIONS.md` (HTTPS).

## Problems

- **"Docker is not running"**: open Docker Desktop and wait until it says it is running, then run
  the install line again. It is safe to run the installer more than once.
- **The download stops**: run the install line again; it continues where it stopped.
- **Another program uses port 3387**: run the installer with another port, for example
  `SIGMA_PORT=4000` before the command on Mac/Linux (`curl … | SIGMA_PORT=4000 sh`).
- **Remove SIGMA**: run `docker compose down -v` inside the `sigma` folder (this deletes your
  designs), then delete the folder.
