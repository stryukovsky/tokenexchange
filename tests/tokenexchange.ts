import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Tokenexchange } from "../target/types/tokenexchange";
import { expect } from "chai";
import {
  getMint,
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair } from "@solana/web3.js";
import { BN } from "bn.js";

describe("tokenexchange", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Tokenexchange as Program<Tokenexchange>;
  const wallet = provider.wallet as anchor.Wallet;

  // Share mint across tests
  let mintKeypair: Keypair;

  it("Creates a new SPL Token Mint with correct constraints", async () => {
    mintKeypair = Keypair.generate();

    const txHash = await program.methods
      .createMint()
      .accounts({
        signer: wallet.publicKey,
        mint: mintKeypair.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        // systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([mintKeypair])
      .rpc();

    console.log("Create mint tx:", txHash);

    const mintInfo = await getMint(provider.connection, mintKeypair.publicKey);
    expect(mintInfo.decimals).to.equal(6);
    expect(mintInfo.mintAuthority?.equals(wallet.publicKey)).to.be.true;
    expect(mintInfo.freezeAuthority?.equals(wallet.publicKey)).to.be.true;
  });

  it("Mints tokens to the signer's ATA", async () => {
    const amount = new BN(1_000_000); // 1 token at 6 decimals

    const txHash = await program.methods
      .mintTokens(amount)
      .accountsPartial({
        signer: wallet.publicKey,
        mint: mintKeypair.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("Mint tokens tx:", txHash);

    // Derive the ATA address to verify balance
    const ata = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      wallet.publicKey
    );

    const tokenAccount = await getAccount(provider.connection, ata);

    expect(tokenAccount.mint.equals(mintKeypair.publicKey)).to.be.true;
    expect(tokenAccount.owner.equals(wallet.publicKey)).to.be.true;
    expect(Number(tokenAccount.amount)).to.equal(1_000_000);
  });

  it("Mints additional tokens and accumulates balance", async () => {
    const amount = new BN(2_000_000); // 2 more tokens

    await program.methods
      .mintTokens(amount)
      .accountsPartial({
        signer: wallet.publicKey,
        mint: mintKeypair.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const ata = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      wallet.publicKey
    );

    const tokenAccount = await getAccount(provider.connection, ata);
    expect(Number(tokenAccount.amount)).to.equal(3_000_000); // 1 + 2
  });
});
