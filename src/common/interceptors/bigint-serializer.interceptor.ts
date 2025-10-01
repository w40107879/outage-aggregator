import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

function convertBigIntToString<T>(data: T): T {
  if (typeof data === 'bigint') {
    return (data.toString() as unknown) as T;
  }

  if (data instanceof Date) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(convertBigIntToString) as unknown as T;
  }

  if (data && typeof data === 'object') {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, convertBigIntToString(v)])
    ) as T;
  }

  return data;
}

@Injectable()
export class BigIntSerializerInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => convertBigIntToString(data)));
  }
}
