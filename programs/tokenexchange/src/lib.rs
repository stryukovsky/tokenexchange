use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{mint_to, MintTo, Mint, TokenAccount, TokenInterface},
};

declare_id!("3pX5NKLru1UBDVckynWQxsgnJeUN3N1viy36Gk9TSn8d");

#[program]
pub mod tokenexchange {

    use super::*;

    pub fn create_mint(ctx: Context<CreateMint>) -> Result<()> {
        msg!("Created Mint Account: {:?}", ctx.accounts.mint.key());
        let state = &mut ctx.accounts.state;
        state.total_mint = 0;
        state.mint_address = *ctx.accounts.mint.to_account_info().key;
        state.authority = *ctx.accounts.signer.to_account_info().key;
        Ok(())
    }

    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        let cpi_accounts = MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.investor.to_account_info(),
            authority: ctx.accounts.signer.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);

        let result = mint_to(cpi_ctx, amount);
        let state = &mut ctx.accounts.state;
        state.total_mint += amount;
        result
    }
}

#[derive(Accounts)]
pub struct CreateMint<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(

        init,
        payer = signer,
        mint::decimals = 6,
        mint::authority = signer.key(),
        mint::freeze_authority = signer.key(),
    )]
    pub mint: InterfaceAccount<'info, Mint>,


    #[account(
        init, 
        payer = signer,
        space = State::LEN
    )]
    pub state: Account<'info, State>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(mut, address = state.authority)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        mint::authority = signer.key(),
        address = state.mint_address, 
    )]
    // NOTE: account is validated via address = ...
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut
    )]
    pub state: Account<'info, State>,

    #[account(
        init_if_needed,
        payer = signer,
        associated_token::mint = mint,
        associated_token::authority = signer,
        associated_token::token_program = token_program,
    )]
    pub investor: InterfaceAccount<'info, TokenAccount>, // ← token_interface::TokenAccount

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>, // ← Program, not Interface
    pub system_program: Program<'info, System>,
}

#[account]
pub struct State {
    pub authority: Pubkey,
    pub mint_address: Pubkey,
    pub total_mint: u64,

}

impl State {
    const LEN: usize = 8 + 72;
}
