#include<__decl__luckyBreakDynamicIblVertex>

attribute vec3 position;
#ifdef NORMAL
attribute vec3 normal;
#endif
#ifdef UV1
attribute vec2 uv;
#endif
#ifdef UV2
attribute vec2 uv2;
#endif
#ifdef VERTEXCOLOR
attribute vec4 color;
#endif

#include<instancesDeclaration>
#ifdef MAINUV1
varying vec2 vMainUV1;
#endif
#ifdef MAINUV2
varying vec2 vMainUV2;
#endif
#if defined(DIFFUSE) && DIFFUSEDIRECTUV == 0
varying vec2 vDiffuseUV;
#endif
#if defined(AO) && AODIRECTUV == 0
varying vec2 vAoUV;
#endif
#if defined(REFLECTIVITYROUGHNESS) && REFLECTIVITYROUGHNESSDIRECTUV == 0
varying vec2 vReflectivityRoughnessUV;
#endif

varying vec3 vPositionW;
#ifdef NORMAL
varying vec3 vNormalW;
#endif
#ifdef VERTEXCOLOR
varying vec4 vColor;
#endif
#ifdef USELODFALLOFF
uniform vec4 vEyePosition;
varying float vLodFallOffFactor;
#endif
#include<clipPlaneVertexDeclaration>
void main(void) {
#include<instancesVertex>
gl_Position=viewProjection*finalWorld*vec4(position,1.0);
vec4 worldPos=finalWorld*vec4(position,1.0);
vPositionW=vec3(worldPos);
#ifdef NORMAL
vNormalW=normalize(vec3(finalWorld*vec4(normal,0.0)));
#endif

#ifndef UV1
vec2 uv=vec2(0.,0.);
#endif
#ifndef UV2
vec2 uv2=vec2(0.,0.);
#endif
#ifdef MAINUV1
vMainUV1=uv;
#endif
#ifdef MAINUV2
vMainUV2=uv2;
#endif
#if defined(DIFFUSE) && DIFFUSEDIRECTUV == 0
if (vDiffuseInfos.x == 0.){
vDiffuseUV=vec2(diffuseMatrix*vec4(uv,1.0,0.0));
}else{
vDiffuseUV=vec2(diffuseMatrix*vec4(uv2,1.0,0.0));
}
#endif
#if defined(AO) && AODIRECTUV == 0
if (vAoInfos.x == 0.){
vAoUV=vec2(aoMatrix*vec4(uv,1.0,0.0));
}else{
vAoUV=vec2(aoMatrix*vec4(uv2,1.0,0.0));
}
#endif
#if defined(REFLECTIVITYROUGHNESS) && REFLECTIVITYROUGHNESSDIRECTUV == 0
if (vReflectivityRoughnessInfos.x == 0.){
vReflectivityRoughnessUV=vec2(reflectivityRoughnessMatrix*vec4(uv,1.0,0.0));
}else{
vReflectivityRoughnessUV=vec2(reflectivityRoughnessMatrix*vec4(uv2,1.0,0.0));
}
#endif
#ifdef USELODFALLOFF
float dis=distance(vPositionW,vEyePosition.xyz);

vLodFallOffFactor=clamp( (dis-vLodFallOff.x)/vLodFallOff.y,0.0,1.0);
#endif

#include<clipPlaneVertex>

#ifdef VERTEXCOLOR
vColor=color;
#endif
#include<pointCloudVertex>
}
