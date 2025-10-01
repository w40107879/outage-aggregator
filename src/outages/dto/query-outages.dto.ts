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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
  @ApiProperty({
    description: 'Type of outage to query.',
    enum: OutageType,
    example: OutageType.led_outage,
  })
  @IsEnum(OutageType)
  type: OutageType;

  @ApiProperty({
    description: 'Inclusive ISO-8601 timestamp marking the start of the search window.',
    format: 'date-time',
    example: '2025-01-15T00:00:00.000Z',
  })
  @IsISO8601({ strict: true })
  start: string;

  @ApiProperty({
    description: 'Inclusive ISO-8601 timestamp marking the end of the search window.',
    format: 'date-time',
    example: '2025-01-15T01:00:00.000Z',
  })
  @IsISO8601({ strict: true })
  @Validate(TimeRangeValidator)
  end: string;

  @ApiPropertyOptional({
    description: 'Filter outages for a specific controller.',
    example: 'AOT1D-25090001',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  controllerId?: string;
}
