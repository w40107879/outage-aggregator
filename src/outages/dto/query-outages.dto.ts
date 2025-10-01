import { OutageType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'TimeRangeValidator', async: false })
class TimeRangeValidator implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments) {
    const { start, end } = args.object as QueryOutagesDto;
    if (!start || !end) {
      return true;
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return false;
    }

    return startDate.getTime() <= endDate.getTime();
  }

  defaultMessage() {
    return 'end must be greater than or equal to start';
  }
}

export class QueryOutagesDto {
  @IsEnum(OutageType)
  type: OutageType;

  @IsISO8601({ strict: true })
  start: string;

  @IsISO8601({ strict: true })
  @Validate(TimeRangeValidator)
  end: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  controllerId?: string;
}
