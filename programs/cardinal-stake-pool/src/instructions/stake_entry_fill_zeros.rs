use crate::state::*;
use crate::errors::ErrorCode;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct StakeEntryFillZeros<'info> {
    #[account(mut)]
    stake_entry: Account<'info, StakeEntry>,
}

pub fn handler(ctx: Context<StakeEntryFillZeros>) -> Result<()> {
    return Err(error!(ErrorCode::InstructionNotSupported));
    let stake_entry = &mut ctx.accounts.stake_entry;
    stake_entry_fill_zeros(stake_entry)?;
    Ok(())
}
