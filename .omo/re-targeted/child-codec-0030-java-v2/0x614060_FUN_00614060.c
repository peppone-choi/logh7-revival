
void __fastcall FUN_00614060(undefined4 *param_1)

{
  int iVar1;
  
  *param_1 = &PTR_FUN_00681fc8;
  FUN_00648d6b(param_1[3]);
  param_1[3] = 0;
  iVar1 = 0;
  do {
    FUN_00648d6b(*(undefined4 *)(param_1[4] + iVar1));
    iVar1 = iVar1 + 4;
  } while (iVar1 < 0x10);
  FUN_00648d6b(param_1[4]);
  param_1[4] = 0;
  FUN_006147e0();
  return;
}

