
int FUN_00614a20(undefined4 param_1,undefined4 param_2,undefined4 param_3)

{
  char cVar1;
  int *piVar2;
  int iVar3;
  
  piVar2 = (int *)FUN_00648d42(8);
  if (piVar2 != (int *)0x0) {
    iVar3 = FUN_00648d42(0xb0);
    if (iVar3 == 0) {
      iVar3 = 0;
    }
    else {
      iVar3 = FUN_00614cb0();
    }
    *piVar2 = iVar3;
    piVar2[1] = 0;
    if (iVar3 != 0) {
      cVar1 = FUN_00614ea0(param_1,param_2,param_3);
      if (cVar1 != '\0') {
        piVar2[1] = (int)DAT_03350938;
        DAT_03350938 = piVar2;
        return *piVar2;
      }
      if ((undefined4 *)*piVar2 != (undefined4 *)0x0) {
        (*(code *)**(undefined4 **)*piVar2)(1);
      }
    }
    FUN_00648d6b(piVar2);
  }
  return 0;
}

