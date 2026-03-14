import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Tokenexchange } from "../target/types/tokenexchange";
import { expect } from "chai";
import { getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";

describe("tokenexchange", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Tokenexchange as Program<Tokenexchange>;
  const wallet = provider.wallet as anchor.Wallet;

  it("Creates a new SPL Token Mint with correct constraints", async () => {
    // 1. Generate a new keypair for the Mint account
    // Since it's not a PDA in your Rust code, we generate it client-side
    const mintKeypair = Keypair.generate();

    // 2. Call the create_mint instruction
    const txHash = await program.methods
      .createMint()
      .accounts({
        signer: wallet.publicKey,
        mint: mintKeypair.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([mintKeypair]) // Must sign because we are initializing a new keypair
      .rpc();

    console.log("Your transaction signature", txHash);

    // 3. Verify the on-chain state
    const connection = provider.connection;

    // Fetch mint data using SPL Token SDK
    const mintInfo = await getMint(connection, mintKeypair.publicKey);

    // Assert Decimals (Rust: mint::decimals = 6)
    expect(mintInfo.decimals).to.equal(6);

    // Assert Authority (Rust: mint::authority = signer.key())
    // Note: mintInfo.mintAuthority is a PublicKey or null
    expect(mintInfo.mintAuthority?.equals(wallet.publicKey)).to.be.true;

    // Assert Freeze Authority (Rust: mint::freeze_authority = signer.key())
    expect(mintInfo.freezeAuthority?.equals(wallet.publicKey)).to.be.true;
  });
});
