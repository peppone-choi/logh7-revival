
undefined1 __thiscall FUN_006123d0(int param_1,int *param_2)

{
  ushort uVar1;
  undefined1 uVar2;
  undefined4 *puVar3;
  uint uVar4;
  undefined4 uVar5;
  undefined **local_20 [3];
  int iStack_14;
  void *local_c;
  undefined1 *puStack_8;
  undefined4 local_4;
  
  local_4 = 0xffffffff;
  puStack_8 = &LAB_0066a398;
  local_c = ExceptionList;
  ExceptionList = &local_c;
  FUN_00610aa0(0,1);
  local_20[0] = &PTR_FUN_00681ef0;
  local_4 = 0;
  puVar3 = (undefined4 *)FUN_00612ef0(*(undefined4 *)(param_1 + 4),*(undefined4 *)(param_1 + 0x14));
  if (puVar3 == (undefined4 *)0x0) {
    local_4 = 0xffffffff;
    local_20[0] = &PTR_FUN_00681ef0;
    FUN_00610bd0();
    uVar2 = 0;
  }
  else {
    uVar1 = *(ushort *)(puVar3 + 2);
    uVar4 = (**(code **)(*param_2 + 0x14))();
    if (uVar1 < uVar4) {
      uVar5 = (**(code **)(*param_2 + 0x14))();
      FUN_005fe742(&DAT_007b4078,s_size_over__d__max_msg_size__d__007b6a28,
                   *(undefined2 *)(puVar3 + 2),uVar5);
      FUN_00613050(*(undefined4 *)(param_1 + 4),*(undefined4 *)(param_1 + 0x14));
      local_4 = 0xffffffff;
      local_20[0] = &PTR_FUN_00681ef0;
      FUN_00610bd0();
      uVar2 = 0;
    }
    else {
      FUN_00610d70(*puVar3,(uint)uVar1,0,1);
      (**(code **)(*param_2 + 0xc))(local_20);
      puVar3[1] = puVar3[1] + iStack_14;
      uVar2 = FUN_00613050(*(undefined4 *)(param_1 + 4),*(undefined4 *)(param_1 + 0x14));
      local_4 = 0xffffffff;
      local_20[0] = &PTR_FUN_00681ef0;
      FUN_00610bd0();
    }
  }
  ExceptionList = local_c;
  return uVar2;
}

