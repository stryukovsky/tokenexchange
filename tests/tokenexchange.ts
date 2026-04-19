import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Tokenexchange } from "../target/types/tokenexchange";
import { expect } from "chai";
import {
  getMint,
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { Keypair, Transaction } from "@solana/web3.js";
import { BN } from "bn.js";

async function fundWallet(wallet: Keypair, provider: anchor.AnchorProvider) {
  const signature = await provider.connection.requestAirdrop(
    wallet.publicKey,
    2 * anchor.web3.LAMPORTS_PER_SOL // Fund with 2 SOL
  );
  await provider.connection.confirmTransaction(signature);
  return wallet;
}

describe("tokenexchange", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Tokenexchange as Program<Tokenexchange>;
  const icoCreator = provider.wallet as anchor.Wallet;
  const investor = Keypair.generate();

  // Share mint across tests
  let mintKeypair: Keypair;
  // Share state too
  let stateKeypair: Keypair;

  it("Creates a new SPL Token Mint with correct constraints", async () => {
    mintKeypair = Keypair.generate();
    stateKeypair = Keypair.generate();
    await fundWallet(investor, provider);

    const txHash = await program.methods
      .createMint()
      .accounts({
        signer: icoCreator.publicKey,
        mint: mintKeypair.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        state: stateKeypair.publicKey,
        // systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([mintKeypair, stateKeypair])
      .rpc();

    console.log("Create mint tx:", txHash);

    const mintInfo = await getMint(provider.connection, mintKeypair.publicKey);
    expect(mintInfo.decimals).to.equal(6);
    expect(mintInfo.mintAuthority?.equals(icoCreator.publicKey)).to.be.true;
    expect(mintInfo.freezeAuthority?.equals(icoCreator.publicKey)).to.be.true;
  });

  it("Mints tokens to the signer's ATA", async () => {
    const amount = new BN(1_000_000); // 1 token at 6 decimals

    // Derive the ATA address
    const ata = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      investor.publicKey
    );
    //
    // const accountInfo = await provider.connection.getAccountInfo(ata);
    // if (!accountInfo) {
    //   const tx = new Transaction();
    //   tx.add(
    //     createAssociatedTokenAccountInstruction(
    //       icoCreator.publicKey, // Payer (must have SOL)
    //       ata, // New ATA address
    //       investor.publicKey, // Owner of the ATA
    //       mintKeypair.publicKey // Mint
    //     )
    //   );
    //   await provider.sendAndConfirm(tx);
    // }

    const txHash = await program.methods
      .mintTokens(amount)
      .accountsPartial({
        signer: icoCreator.publicKey,
        mint: mintKeypair.publicKey,
        state: stateKeypair.publicKey,
        investor: investor.publicKey,
        investorAta: ata,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("Mint tokens tx:", txHash);
    //
    // const tokenAccount = await getAccount(provider.connection, ata);
    //
    // expect(tokenAccount.mint.equals(mintKeypair.publicKey)).to.be.true;
    // expect(tokenAccount.owner.equals(icoCreator.publicKey)).to.be.true;
    // expect(Number(tokenAccount.amount)).to.equal(1_000_000);
  });

  // it("Mints additional tokens and accumulates balance", async () => {
  //   const amount = new BN(2_000_000); // 2 more tokens
  //
  //   await program.methods
  //     .mintTokens(amount)
  //     .accountsPartial({
  //       signer: icoCreator.publicKey,
  //       mint: mintKeypair.publicKey,
  //       tokenProgram: TOKEN_PROGRAM_ID,
  //       state: stateKeypair.publicKey,
  //     })
  //     .rpc();
  //
  //   const ata = await getAssociatedTokenAddress(
  //     mintKeypair.publicKey,
  //     icoCreator.publicKey
  //   );
  //
  //   const tokenAccount = await getAccount(provider.connection, ata);
  //   expect(Number(tokenAccount.amount)).to.equal(3_000_000); // 1 + 2
  // });
});
