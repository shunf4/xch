import Constants from "../constants"
import { assertType, assertCondition, assertTypeOrInstanceOf, TypelessPartial, NonFunctionProperties } from "../xchUtil"
import { EntityValueError } from "../errors"

type TypeString = ("string" | "number" | "boolean" | "function" | "undefined" | "object")

// isOptional, propName, assertFunc, assertArg
export type EntityValidateRuleList<ET> =
([boolean, NonFunctionProperties<ET>, typeof assertType, TypeString[]]
  | [boolean, NonFunctionProperties<ET>, typeof assertType, TypeString]
  | [boolean, NonFunctionProperties<ET>, typeof assertCondition, Function]
  | [boolean, NonFunctionProperties<ET>, typeof assertCondition, Function[]]
  | [boolean, NonFunctionProperties<ET>, typeof assertCondition, Function[][]]
  | [boolean, NonFunctionProperties<ET>, typeof assertTypeOrInstanceOf, (TypeString | Function)[]])[]

export function validateEntity<ET>(getEntityFunc: (type?: any) => { new (...args: any): ET }, sth: TypelessPartial<ET>, ruleList: EntityValidateRuleList<ET>): void {
  const entityClassName: string = getEntityFunc().name
  ruleList.forEach(([isOptional, propName, assertFunc, assertArg]) => {
    if (!isOptional || sth[propName] !== undefined) {
      (assertFunc as Function)(sth[propName], assertArg, EntityValueError, `${entityClassName}.${propName}`)
    }
  })
}