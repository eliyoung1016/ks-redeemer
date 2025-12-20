# ks-redeemer

ks-redeemer is a small Node.js utility for redeeming codes for authorized users. It is intentionally simple — there is no .env or external service required. To use it, a user only needs to make sure their ID is present in `ids.txt` and run the redeem script with the code.

## Quick summary

- Run the redeem operation with: `node redeem.js CODE`

## Features

- **Concurrent Processing**: Runs 3 simultaneous browser tabs (workers) to speed up redemption.
- **Smart Retries**: Automatically retries failed requests up to 3 times (skips retries for success or "already redeemed" responses).
- **Progressive Reporting**: Saves a detailed JSON report (`report-<TIMESTAMP>.json`) after every single redemption, so you never lose progress.
- **Human-Like Behavior**: Adds random idle time (2-5 seconds) between requests to avoid rate limiting.
- **Detailed Logging**: Console output is timestamped and tagged by worker ID for easy debugging.

## Requirements

- Node.js (recommended LTS)
- The repository files (including `redeem.js` and `ids.txt`) present in the project root
- Playwright browsers installed (`npx playwright install`)

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/eliyoung1016/ks-redeemer.git
cd ks-redeemer
npm install
npx playwright install
```

## How to use

1. Ensure your ID is listed in `ids.txt` (one ID per line). Example `ids.txt` content:

```
12345678
14785296
17852396
```

You can add an ID with a simple append command:

```bash
echo "your-id-here" >> ids.txt
```

2. Run the redeem script with the code as the first argument:

```bash
node redeem.js CODE
```

Example:

```bash
node redeem.js PROMO-2025-XYZ
```

### Reporting
A report file named `report-YYYY-MM-DDTHH-mm-ss-ms.json` will be generated in the project directory. It contains the status, error code, and timestamp for every ID processed.

## Troubleshooting

- If you see "ALREADY_REDEEMED", it means the code has already been claimed for that ID.
- If the script stops (Ctrl+C), check the latest JSON report to see which IDs were completed.
- To adjust the speed (concurrency) or delays, you can modify the `CONCURRENCY`, `MIN_DELAY`, or `MAX_DELAY` constants in `redeem.js`.

## Maintainer

- Repository: [eliyoung1016/ks-redeemer](https://github.com/eliyoung1016/ks-redeemer)
- Maintainer: eliyoung1016
