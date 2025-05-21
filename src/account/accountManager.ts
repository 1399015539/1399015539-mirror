export type AccountMeta = { id: string; name: string };

// TODO: 替换为真实 cookie；此处仅为演示
const accounts = [
  {
    id: 'guest',
    name: '游客(未登录)',
    cookie: '_ga=GA1.1.1059442835.1728200228; __stripe_mid=ab3eaba4-f427-4675-9047-7329532ba4067810e8; _ga_Q0DQ5L7K0D=GS1.1.1732000543.6.0.1732000543.0.0.0; AMP_MKTG_437c42b22c=JTdCJTdE; _cfuvid=BH5u2.XzLAdu31xveV6s7zYHWGWcXO0O_5fheOFxm70-1747390904407-0.0.1.1-604800000; __cf_bm=oFEpYhnogxznbpRDaSeReakR8mQvtpV9gzkT0ndDrpg-1747471049-1.0.1.1-ksHw4P.VLf2byf0GF9OvJW3z6ST4l1lhy9YVAiTGsGjX5kDmpcj6adzIj61USNHp.1Ywiy4PPqj3cY9N2u0l_PlyfUEmiBJdtsMoiFmSh.w; AMP_437c42b22c=JTdCJTIyZGV2aWNlSWQlMjIlM0ElMjJlNTFjYmE1NS1mNzlhLTQzNWItYTAwOS01YWEzMjc0MGQ1ZTMlMjIlMkMlMjJzZXNzaW9uSWQlMjIlM0ExNzQ3NDcwMTQzNTcyJTJDJTIyb3B0T3V0JTIyJTNBZmFsc2UlMkMlMjJsYXN0RXZlbnRUaW1lJTIyJTNBMTc0NzQ3MTQyMDY0NCUyQyUyMmxhc3RFdmVudElkJTIyJTNBMTQwJTdE; _dd_s=logs=1&id=f522a348-836f-4a62-97f5-8b6207004500&created=1747470143510&expire=1747472320541',
  },
  {
    id: 'demo1',
    name: '演示账号-1',
    cookie: '_ga=GA1.1.1059442835.1728200228; __stripe_mid=ab3eaba4-f427-4675-9047-7329532ba4067810e8; _ga_Q0DQ5L7K0D=GS1.1.1732000543.6.0.1732000543.0.0.0; AMP_MKTG_437c42b22c=JTdCJTdE; _cfuvid=b94C6sMGjLcGkMMJB5Sq_E9KGbu8vS.7exzFUC3UCIk-1747531648052-0.0.1.1-604800000; __cf_bm=.6KGY3CXiofB58.RCYirrQsWQk4vp6E8OKA3cENi6wc-1747618408-1.0.1.1-zROw8YsLZDvYdB7Wva9Q87TLLjSY.LHn_Y5g3o1gJLp9GwhnfkrAMZRxRKa0Bh4ySdQkpEPrTapcVju1Q3iBfqa_VFpYoQuux0jLBc.cxkU; __Host-Midjourney.AuthUserTokenV3_i=eyJhbGciOiJSUzI1NiIsImtpZCI6IjY3ZDhjZWU0ZTYwYmYwMzYxNmM1ODg4NTJiMjA5MTZkNjRjMzRmYmEiLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoiYW5nZWxhMDE4OTEzMSIsIm1pZGpvdXJuZXlfaWQiOiJmYmEyMzczYi0zMWVkLTRmMmItODBmNi05YTEwMzI1NTE3ZTMiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vYXV0aGpvdXJuZXkiLCJhdWQiOiJhdXRoam91cm5leSIsImF1dGhfdGltZSI6MTc0NzYxODUxMiwidXNlcl9pZCI6IjVCRnRnUHVwZlllUjQyczg1dzR3Y0gzVGt3UzIiLCJzdWIiOiI1QkZ0Z1B1cGZZZVI0MnM4NXc0d2NIM1Rrd1MyIiwiaWF0IjoxNzQ3NjE4NTEyLCJleHAiOjE3NDc2MjIxMTIsImVtYWlsIjoia29yb2dvZ2hleWFzQGhvdG1haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImZpcmViYXNlIjp7ImlkZW50aXRpZXMiOnsiZGlzY29yZC5jb20iOlsiMTI3MjE4MTM4Mjg0NzY2MDA1MiJdLCJlbWFpbCI6WyJrb3JvZ29naGV5YXNAaG90bWFpbC5jb20iXX0sInNpZ25faW5fcHJvdmlkZXIiOiJkaXNjb3JkLmNvbSJ9fQ.Z613EUhsADGl-ibKcNy1kRp9lVGeSB4CB5rDVLPVglPZAihKDcJHqGBrpPtpRdNbhXmf1KXIhuIBUkZWbbwhVsAXpGXUPk8jfJr92Ip13vhkp8jmP8WFTVRd3HKANyyANX-2whtg3VTlaQongs_IWDXTMoPu6kZgvXyHoUrcLai7-PJjMNobRJMhXT13Wf8Y6i_7qIoLhSGJmbT47lF_aaWMEPgiDq-lPMt-qtbcFWH3Wbr28JrsQYn7-qPiFHMH0M1__aK1rwPxCDbgiXPPFNQ-s7C8_UcW5A84Eh_ZVZHI4hJoVTs6lDIfix9Ijd5Pd7vRzgc5xDpbv3hXNnos9A; __Host-Midjourney.AuthUserTokenV3_r=AMf-vBz7mzIKbvnwVqmEWfh9IJkxr4H7tR8NbwQqVLsc1klpb3lcjFCosoSeXbjGT-9kSOVZAR2Pf2lzec2bmC1Aou3vdqnxVJks6dlt-UEZkqZKQe7g687bYkNWJE0_rqhSAJMZeMetX4WmhR4tiBAvR_tSHTW-LZhLPXBRP7bX0wuOdDjQREd1yPQ-dLVFpHujJPmuvnMjkN0CVpRTUgvG4PaYkXwixOfuJAquSYDSZp9dRMPs6BacV9MS2u-ULpozfvx_iWPkbJIb6ToEvdhAmDaYWaJnxg; AMP_437c42b22c=JTdCJTIyZGV2aWNlSWQlMjIlM0ElMjJlNTFjYmE1NS1mNzlhLTQzNWItYTAwOS01YWEzMjc0MGQ1ZTMlMjIlMkMlMjJ1c2VySWQlMjIlM0ElMjJmYmEyMzczYi0zMWVkLTRmMmItODBmNi05YTEwMzI1NTE3ZTMlMjIlMkMlMjJzZXNzaW9uSWQlMjIlM0ExNzQ3NjE4NDA5Mjk2JTJDJTIyb3B0T3V0JTIyJTNBZmFsc2UlMkMlMjJsYXN0RXZlbnRUaW1lJTIyJTNBMTc0NzYxODUxMzE4MyUyQyUyMmxhc3RFdmVudElkJTIyJTNBMTk1JTdE; _dd_s=logs=1&id=131b835f-61f8-44c4-9ec6-ddf5d08814f0&created=1747618320543&expire=1747619522486',
  },
] as const;

export class AccountManager {
  static list(): AccountMeta[] {
    return accounts.map(({ id, name }) => ({ id, name }));
  }

  static getCookie(id?: string): string | undefined {
    if (!id) return undefined;
    const found = accounts.find((a) => a.id === id);
    return found?.cookie;
  }
} 