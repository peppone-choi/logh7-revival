
u_short * FUN_00614c70(int *param_1,u_short *param_2)

{
  u_short uVar1;
  
  if ((int)(uint)*(ushort *)(param_1 + 2) < param_1[1] + (2 - *param_1)) {
    return (u_short *)0x0;
  }
  uVar1 = ntohs(*(u_short *)param_1[1]);
  *param_2 = uVar1;
  param_1[1] = param_1[1] + 2;
  return param_2;
}

