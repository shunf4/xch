export class ConfigTypeError extends Error {}

export class ConfigValueError extends Error {}

export class EntityValueError extends Error {}

export class RuntimeLogicError extends Error {}

export class TelephoneBadPeerError extends Error {}

export class TelephoneBadTagError extends Error {}

export class TelephonePeerEndedWriteError extends Error {}

export class TimeoutError extends Error {}

export class GetStateInvalidArgumentError extends Error {}

export class TransactionError extends Error {}

export class TransactionInsufficientAmountError extends TransactionError {}

export class TransactionNonceError extends TransactionError {}

export class VerificationError extends Error {}

export class DposError extends Error {}

export class BlockVerificationError extends VerificationError {}

export class BlockVerificationHashError extends BlockVerificationError {}

export class BlockVerificationPrevHashError extends BlockVerificationError {}

export class BlockVerificationHeightError extends BlockVerificationError {}

export class BlockVerificationSignatureError extends BlockVerificationError {}

export class BlockVerificationVersionError extends BlockVerificationError {}

export class BlockVerificationSlotError extends BlockVerificationError {}

export class BlockVerificationStateHashError extends BlockVerificationError {}

export class TransactionVerificationError extends VerificationError {}

export class TransactionVerificationHashError extends VerificationError {}

export class TransactionVerificationSignatureError extends VerificationError {}

export class TransactionVerificationFeeError extends VerificationError {}

export class TransactionVerificationAmountError extends VerificationError {}

export class TransactionVerificationTimestampError extends VerificationError {}

export class TransactionVerificationSeqInBlockError extends VerificationError {}

export class DposInsufficientWitnessError extends DposError {}

export class DposInvalidWitnessError extends DposError {}

