import { Transaction } from "../entity/Transaction";
import { Block } from "../entity/Block";
import { TransactionInsufficientAmountError, TransactionNonceError } from "../errors";
import { AccountStateSnapshot } from "../entity/AccountStateSnapshot";
import PeerId from "peer-id";

export interface ITransactionApplyOptions {
  transaction: Transaction,
  baseBlock: Block,
  targetBlock: Block,
}

export interface ITransactionApplyContext {
  newNextBlock: Block,
  newSender: AccountStateSnapshot,
}

export interface ITransactionVerifyOptions {
  transaction: Transaction,
  blockTimestamp: Date,
  expectedSeqInBlock: number,
}

export class BaseTransactionHandler {
  public async apply(options: ITransactionApplyOptions): Promise<void> {
    const context: Partial<ITransactionApplyContext> = {}
    await this.doApply(context, options)
    await this.afterApply(context, options)
  }

  public async verify(options: ITransactionVerifyOptions): Promise<void> {
    await this.doVerify(options)
  }

  protected getFee(): number {
    return 10000
  }

  protected async doApply(context: Partial<ITransactionApplyContext>, {
    transaction,
    baseBlock,
    targetBlock,
  }: ITransactionApplyOptions): Promise<void> {
    // Load
    const newNextBlock = await Block.normalize(targetBlock)

    const sender = await baseBlock.getFirstSpecificState({
      shouldCreateIfNotFound: true,
      shouldIncludeTemporary: true,
      specificPubKey: transaction.sender,
      targetBlockToCreateIn: newNextBlock,
    })

    const newSender = await AccountStateSnapshot.normalize(sender)
    const amountToSubtract = transaction.fee + transaction.amount

    // Check whether this transaction can be executed
    if (transaction.nonce !== sender.nonce) {
      throw new TransactionNonceError(`sender.nonce: ${sender.nonce} !== transaction.nonce: ${transaction.nonce}`)
    }

    if (sender.balance < amountToSubtract) {
      throw new TransactionInsufficientAmountError(`sender.balance: ${sender.balance} < fee: ${transaction.fee} + amount: ${transaction.amount}`)
    }

    // Execute

    newSender.balance -= amountToSubtract
    newSender.nonce += 1

    Object.assign(context, {
      newSender,
      newNextBlock,
    })
  }

  protected async afterApply({
    newSender,
    newNextBlock,
  }: Partial<ITransactionApplyContext>,
  {
    transaction,
    baseBlock,
    targetBlock,
  }: ITransactionApplyOptions): Promise<void> {
    await newSender.calcHash({
      shouldAssignExistingHash: false,
      shouldAssignHash: true,
      shouldUseExistingHash: true,
    })
    
    Object.assign(targetBlock, newNextBlock)
  }

  protected async doVerify({
    transaction,
    blockTimestamp,
    expectedSeqInBlock,
  }: ITransactionVerifyOptions): Promise<void> {
    // 1. verify hash
    const expectedHash = await transaction.calcHash({
      encoding: "hex",
      shouldAssignHash: false,
    })

    if (expectedHash !== transaction.hash) {
      throw new TransactionVerificationHashError(`verify transaction hash error: ${transaction.hash} (expected ${expectedHash})`)
    }

    // 1. verify signature
    const senderPubKey = await PeerId.createFromPubKey(transaction.sender)
    const verifySignResult = await senderPubKey.pubKey.verify(Buffer.from(transaction.hash, "hex"), Buffer.from(transaction.signature, "hex"))
    if (verifySignResult === false) {
      throw new TransactionVerificationSignatureError(`verify transaction(${transaction.hash}): signature incorrect`)
    }

    // 2. verify fee
    const expectedFee = this.getFee()
    if (transaction.fee !== expectedFee) {
      throw new TransactionVerificationFeeError(`verify transaction(${transaction.hash}): fee invalid: ${transaction.fee} (expected: ${expectedFee})`)
    }

    // 3. verify amount
    if (transaction.amount < 0 || !Number.isInteger(transaction.amount)) {
      throw new TransactionVerificationAmountError(`verify transaction(${transaction.hash}): amount invalid: ${transaction.amount}`)
    }

    // 4. verify timestamp
    if (transaction.timestamp.getTime() > blockTimestamp.getTime()) {
      throw new TransactionVerificationTimestampError(`verify transaction(${transaction.hash}): timestamp(${transaction.timestamp.toISOString()}) greater than that of block(${blockTimestamp.toISOString()})`)
    }

    // 5. verify seqInBlock
    if (transaction.seqInBlock > expectedSeqInBlock) {
      throw new TransactionVerificationSeqInBlockError(`verify transaction(${transaction.hash}): seqInBlock(${transaction.seqInBlock}) invalid (expected ${expectedSeqInBlock})`)
    }
  }
}