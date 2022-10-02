import type { AccountData } from "@cardinal/common";
import { tryGetAccount } from "@cardinal/common";
import { utils } from "@project-serum/anchor";
import { SignerWallet } from "@saberhq/solana-contrib";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";

import { executeTransaction } from "../src";
import {
  getRewardDistributor,
  getRewardEntry,
} from "../src/programs/rewardDistributor/accounts";
import {
  findRewardDistributorId,
  findRewardEntryId,
} from "../src/programs/rewardDistributor/pda";
import {
  withClaimRewards,
  withInitRewardEntry,
} from "../src/programs/rewardDistributor/transaction";
import type { StakeEntryData } from "../src/programs/stakePool";
import { getActiveStakeEntriesForPool } from "../src/programs/stakePool/accounts";
import { withUpdateTotalStakeSeconds } from "../src/programs/stakePool/transaction";
import { connectionFor } from "./connection";
import { chunkArray } from "./utils";

const BATCH_SIZE = 4;

const authorityWallet = Keypair.fromSecretKey(
  utils.bytes.bs58.decode("SECRET_KEY")
); // your wallet's secret key

const main = async (stakePoolId: PublicKey, cluster = "devnet") => {
  const connection = connectionFor(cluster);

  const [rewardDistributorId] = await findRewardDistributorId(stakePoolId);
  const checkRewardDistributorData = await tryGetAccount(() =>
    getRewardDistributor(connection, rewardDistributorId)
  );
  if (!checkRewardDistributorData) {
    throw "No reward distributor found";
  }

  const activeStakeEntries = await getActiveStakeEntriesForPool(
    connection,
    stakePoolId
  );
  console.log(
    `Estimated SOL needed to claim rewards for ${activeStakeEntries.length} staked tokens:`,
    0.002 * activeStakeEntries.length,
    "SOL"
  );

  const chunks = chunkArray(
    activeStakeEntries,
    BATCH_SIZE
  ) as AccountData<StakeEntryData>[][];

  await Promise.all(
    chunks.map(async (chunk, index) => {
      const transaction = new Transaction();
      for (let j = 0; j < chunk.length; j++) {
        const stakeEntryData = chunk[j]!;
        const [rewardEntryId] = await findRewardEntryId(
          checkRewardDistributorData.pubkey,
          stakeEntryData.pubkey
        );
        const checkRewardEntry = await tryGetAccount(() =>
          getRewardEntry(connection, rewardEntryId)
        );
        if (!checkRewardEntry) {
          await withInitRewardEntry(
            transaction,
            connection,
            new SignerWallet(authorityWallet),
            {
              stakeEntryId: stakeEntryData.pubkey,
              rewardDistributorId: checkRewardDistributorData.pubkey,
            }
          );
        }
        withUpdateTotalStakeSeconds(
          transaction,
          connection,
          new SignerWallet(authorityWallet),
          {
            stakeEntryId: stakeEntryData.pubkey,
            lastStaker: authorityWallet.publicKey,
          }
        );
        await withClaimRewards(
          transaction,
          connection,
          new SignerWallet(authorityWallet),
          {
            stakePoolId: stakePoolId,
            stakeEntryId: stakeEntryData.pubkey,
            lastStaker: stakeEntryData.parsed.lastStaker,
            payer: authorityWallet.publicKey,
          }
        );
      }
      try {
        if (transaction.instructions.length > 0) {
          const txid = await executeTransaction(
            connection,
            new SignerWallet(authorityWallet),
            transaction,
            {}
          );
          console.log(
            `[${index + 1}/${
              chunks.length
            }] Succesfully claimed rewards with transaction ${txid} (https://explorer.solana.com/tx/${txid}?cluster=${cluster})`
          );
        }
      } catch (e) {
        console.log(e);
      }
    })
  );
  console.log(
    `Successfully claimed rewards for ${activeStakeEntries.length} staked tokens`
  );
};

const stakePoolId = new PublicKey("POOL_ID");
main(stakePoolId, "mainnet").catch((e) => console.log(e));
