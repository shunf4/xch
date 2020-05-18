import Constants from "../constants"
import { assertType, assertCondition, assertTypeOrInstanceOf, TypelessPartial, NonFunctionProperties, fullObjectOutput } from "../xchUtil"
import { EntityValueError } from "../errors"
import { getConnection, SelectQueryBuilder } from "typeorm"
import { EntityNotFoundError } from "typeorm/error/EntityNotFoundError"

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

export async function findOneWithAllRelationsOrFail<ET, ETConstructor extends { new (...args: any): ET } & { addLeftJoinAndSelect(qb: SelectQueryBuilder<ET>): SelectQueryBuilder<ET> }>(
  getEntityFunc: (type?: any) => ETConstructor,
  currentEntityNameCamelCase: string,
  condition: TypelessPartial<ET>
): Promise<ET> {
  const CurrentEntity = getEntityFunc()

  let allRelationsSqb = getConnection()
    .createQueryBuilder(CurrentEntity, currentEntityNameCamelCase)
    .where("1 = 1")
  
  for (const [k, v] of Object.entries(condition)) {
    allRelationsSqb = allRelationsSqb
      .andWhere(`${currentEntityNameCamelCase}.${k} = :${k}`, {
        [k]: v
      })
  }

  allRelationsSqb = CurrentEntity.addLeftJoinAndSelect(allRelationsSqb)

  const resultObj = await allRelationsSqb.getOne()
  if (resultObj === undefined) {
    throw new EntityNotFoundError(CurrentEntity, fullObjectOutput(condition))
  }

  if (typeof((resultObj as any).reorder) === "function") {
    await (resultObj as any).reorder()
  }

  return resultObj
}