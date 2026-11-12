# Anchor: oracle, token issuance, and coupon payouts

Practical starting checklist for developers who already know Rust and Solana.
Here, **coupon** means periodic interest paid to token holders, usually in a
separate token such as USDC. These are design recommendations, not functionality
already implemented in this repository.

## 1. Read an oracle value

- **Use the provider's verification SDK, not a client-supplied number.** For
  Pyth Core, accept `Account<'info, PriceUpdateV2>` and call
  `get_price_no_older_than(&Clock::get()?, max_age, &configured_feed_id)`; this
  checks feed identity, freshness, and full verification. The account type
  checks the expected owner.
- **Pin the feed and provider in trusted configuration.** Validate the
  base/quote pair and cluster; do not let a caller choose the feed used to price
  issuance. Pyth Core and Pro/Lazer have different verification paths—do not mix
  their APIs.
- **Choose freshness and confidence limits per asset.** Reject stale updates,
  implausible future timestamps, nonpositive prices for positive-priced assets,
  and excessive `conf / price`. A signature alone does not make a price
  suitable.
- **Use checked fixed-point math.** Pyth values are `price × 10^exponent`;
  account for both token decimals, bound exponents, use checked `u128`/`i128`
  intermediates, and specify rounding. Never use floating point for balances.
- **Treat availability as a safety condition.** Pause price-dependent
  issuance/redemption on invalid data; define market-hours and outage behavior.
  Do not silently reuse the last good price or assume a stablecoin always equals
  $1.
- **Plan update delivery and adverse selection.** A client/keeper posts verified
  updates before consumption; users may choose favorable updates within your
  freshness window. Bound trade size, require user `min_out`/deadlines, and
  consider delayed settlement for latency-sensitive pricing.
- **Match SDK versions.** This repository uses Anchor `0.32.1`; Pyth currently
  documents receiver SDK `1.2.0` as compatible. Check the chosen
  release/features and program IDs before adding dependencies; do not blindly
  install latest.

## 2. Mint tokens or transfer another token

- **Choose one token program unless you need both.** Classic SPL Token is
  simpler; use Token-2022 for required extensions. Anchor's
  `token_interface::{Mint, TokenAccount, TokenInterface}` supports both, but
  does not automatically make every extension safe.
- **Mint through CPI:** `token_interface::mint_to`, with
  `MintTo { mint, to, authority }`. Use a scoped PDA as mint authority and
  `CpiContext::with_signer` with validated seeds and bump. A PDA signature
  authorizes the CPI—not the user's right to issue tokens.
- **Enforce issuance policy before minting.** Authenticate the issuer or verify
  payment/collateral, enforce supply limits, and calculate the amount on-chain.
  Collect payment and mint in the same transaction so either both succeed or
  neither does.
- **Transfer through CPI:** `token_interface::transfer_checked`, with
  `TransferChecked { mint, from, to, authority }`, raw-unit amount, and decimals
  read from the validated mint. Use the user's signer for deposits; a
  vault-authority PDA signs withdrawals/payouts. You cannot mint another
  project's token without its mint authority.
- **Constrain every relationship.** Pin mints with `address`/`has_one`; validate
  `token::mint`, `token::authority`, and `token::token_program`. Use
  `associated_token::*` for canonical user ATAs. A valid token account is not
  necessarily the intended recipient or vault.
- **Separate account ownership from spending authority.** The Token Program owns
  mint/vault account data; your PDA is the mint authority or token account
  authority. Scope PDAs by market/issuance and purpose; never accept an
  arbitrary CPI program.
- **Amounts are base-unit `u64`s.** Use checked wider arithmetic before
  conversion; specify rounding and reject source/destination aliasing where
  balance changes matter. Reload accounts after CPI if subsequent logic reads
  changed balances or supply.
- **Explicitly allowlist Token-2022 extensions.** Transfer fees change received
  amounts; hooks need extra accounts; permanent delegates and freeze controls
  affect custody. Reject unsupported combinations rather than assuming ordinary
  SPL behavior.
- **Minimize privileged powers.** Omit freeze authority unless needed; revoke
  mint authority for permanently fixed supply. Protect remaining admin/upgrade
  authorities with multisig and an explicit upgrade policy.

## 3. Pay coupon income

- **Define entitlement first.** Is the coupon based on a record-date balance or
  time held? Specify face value, rate, day-count convention, payment dates,
  payout mint, rounding, and whether accrued income follows a transfer. Token
  price is not automatically coupon principal.
- **Start with escrow if acceptable.** Hold eligible tokens in a PDA-controlled
  vault and track user positions. Settle accrued rewards before every
  deposit/withdrawal; use a cumulative reward-per-unit index plus per-position
  checkpoints. This avoids tracking arbitrary wallet transfers.
- **For freely transferable tokens, choose an explicit model.** Record-date
  snapshots with a committed Merkle root suit periodic payments, but require a
  trustworthy snapshot process and root governance. Continuous accrual needs
  transfer-aware accounting, e.g. a carefully designed Token-2022 hook; handle
  mint/burn separately too.
- **Never pay historical income from today's wallet balance.** Otherwise tokens
  can move between wallets to claim repeatedly, or newly bought tokens can
  receive past accrual. A plain SPL transfer does not notify your Anchor
  program.
- **Prefer funded, pull-based claims.** Fund a payout-token vault, then let each
  beneficiary claim through `transfer_checked`; avoid looping over all holders.
  Standard tokens do not pay coupons automatically—someone must submit a
  transaction.
- **Make claims replay-safe.** Bind entitlement to issuance + coupon period +
  beneficiary (and leaf index where applicable). Persist a claim receipt/bitmap
  or cumulative claimed amount; record the claim before the payout CPI. Failure
  must roll back both; closing/recreating a receipt must not enable another
  claim.
- **Keep liabilities explicit.** Track outstanding coupons, prevent admin
  withdrawal of reserved funds, define underfunding and expiry behavior, and
  carry rounding dust deliberately. Minting more investment tokens is dilution,
  not income in the payout asset.
- **Use an oracle only when the coupon needs one.** Fixed USDC-per-token
  payments need no spot oracle. For FX/index-linked coupons, fix the observation
  time/window and rate once per period; do not let each claimant choose a
  favorable current price.

## Minimum tests before real funds

- Oracle: wrong feed/owner, stale/future update, insufficient verification, wide
  confidence, exponent/overflow boundaries, outage behavior.
- Tokens: wrong mint/program/authority/recipient, forged PDA, unauthorized
  issuance, cap bypass, failed payment, unsupported extensions, self-transfer.
- Coupons: double claim, receipt recreation, transfer-before-claim,
  deposit/withdraw checkpoints, mint/burn timing, period boundaries, dust,
  underfunding, and atomic rollback on failed payout.

## Official references

- [Pyth Solana integration: Core and Pro/Lazer](https://docs.pyth.network/price-feeds/use-real-time-data/solana)
  · [Oracle safety practices](https://docs.pyth.network/pro/best-practices)
- [Anchor mint CPI](https://www.anchor-lang.com/docs/tokens/basics/mint-tokens)
  ·
  [Transfer CPI](https://www.anchor-lang.com/docs/tokens/basics/transfer-tokens)
  ·
  [Account constraints](https://www.anchor-lang.com/docs/references/account-constraints)
- [Token-2022 transfer-hook interface](https://www.solana-program.com/docs/transfer-hook-interface)

Coupon models above are architectural recommendations, not a built-in SPL coupon
standard.
