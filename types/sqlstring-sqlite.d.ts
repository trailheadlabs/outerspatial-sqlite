declare module 'sqlstring-sqlite' {
  interface SqlString {
    escape(value: any): string;
  }

  const SqlString: SqlString;
  export default SqlString;
}
