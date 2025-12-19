# ks-redeemer

ks-redeemer is a small Node.js utility for redeeming codes for authorized users. It is intentionally simple — there is no .env or external service required. To use it, a user only needs to make sure their ID is present in `ids.txt` and run the redeem script with the code.

## Quick summary

- Run the redeem operation with: `node redeem.js CODE`

## Requirements

- Node.js (recommended LTS)
- The repository files (including `redeem.js` and `ids.txt`) present in the project root

## Installation

Clone the repository and install dependencies (if any):

```bash
git clone https://github.com/eliyoung1016/ks-redeemer.git
cd ks-redeemer
npm install
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

What to expect:
- If the ID is not found in `ids.txt`, the redeem will fail (the script will print an error or exit with a non-zero status).
- If the code is invalid or already redeemed, the script will indicate failure per its built-in checks.

Note: The exact messages and exit codes depend on the implementation in `redeem.js`.

## Troubleshooting

- If you expect different behavior (e.g., database-backed redemption), that is not part of this repository — ks-redeemer is file-based and requires only `ids.txt` + `redeem.js`.

## Maintainer

- Repository: [eliyoung1016/ks-redeemer](https://github.com/eliyoung1016/ks-redeemer)
- Maintainer: eliyoung1016
