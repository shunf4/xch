import { BaseTransactionHandler, ITransactionApplyOptions, ITransactionApplyContext, ITransactionVerifyOptions } from "./base"
import { Transaction } from "../entity/Transaction"
import { Block } from "../entity/Block"
import { AccountStateSnapshot } from "../entity/AccountStateSnapshot"

interface ITransactionApplyTransferContext extends ITransactionApplyContext {
  newRecipient: AccountStateSnapshot,
}

export class Transfer extends BaseTransactionHandler {
  protected async doApply(context: Partial<ITransactionApplyContext>, options: ITransactionApplyOptions): Promise<void> {
    await super.doApply(context, options)

    const {
      transaction,
      baseBlock,
      targetBlock,
    } = options

    const {
      newNextBlock,
    }  = context

    // Load
    const recipient = await baseBlock.getFirstSpecificState({
      shouldCreateIfNotFound: true,
      shouldIncludeTemporary: true,
      specificPubKey: transaction.recipient,
      targetBlockToCreateIn: newNextBlock,
    })

    const newRecipient = await AccountStateSnapshot.normalize(recipient)
    
    // Execute
    newRecipient.balance += transaction.amount

    const contextAlias = context as ITransactionApplyTransferContext

    contextAlias.newRecipient = newRecipient
  }

  protected async afterApply(context: ITransactionApplyTransferContext, options: ITransactionApplyOptions): Promise<void> {
    const {
      newRecipient
    } = context

    await newRecipient.calcHash({
      shouldAssignExistingHash: false,
      shouldAssignHash: true,
      shouldUseExistingHash: true,
    })

    await super.afterApply(context, options)
  }

  protected async doVerify(options: ITransactionVerifyOptions): Promise<void> {
    await super.doVerify(options)
  }
}