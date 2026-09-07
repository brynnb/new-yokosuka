#ifdef NORMAL
#extension GL_OES_standard_derivatives : enable
#endif
#ifdef LODBASEDMICROSURFACE
#extension GL_EXT_shader_texture_lod : enable
#endif
precision highp float;
#include<__decl__luckyBreakDynamicIblFragment>

uniform vec4 vEyePosition;
#if defined(IRRADIANCE) || defined(DYAO)

uniform float vDynamicRatios[9];
#endif

varying vec3 vPositionW;
#ifdef NORMAL
varying vec3 vNormalW;
#endif
#ifdef VERTEXCOLOR
varying vec4 vColor;
#endif
#ifdef MAINUV1
varying vec2 vMainUV1;
#endif
#ifdef MAINUV2
varying vec2 vMainUV2;
#endif
#ifdef USELODFALLOFF
varying float vLodFallOffFactor;
#endif

#include<helperFunctions>

float environmentRadianceOcclusion(
  float ambientOcclusion,
  float NdotVUnclamped
) {
  float combined = NdotVUnclamped + ambientOcclusion;
  return clamp(
    combined * combined - 1.0 + ambientOcclusion,
    0.0,
    1.0
  );
}

#ifdef DIFFUSE
#if DIFFUSEDIRECTUV == 1
#define vDiffuseUV vMainUV1
#elif DIFFUSEDIRECTUV == 2
#define vDiffuseUV vMainUV2
#else
varying vec2 vDiffuseUV;
#endif
uniform sampler2D diffuseSampler;
#endif
#ifdef AO
#if AODIRECTUV == 10
uniform samplerCube aoSampler;
#else
uniform sampler2D aoSampler;
#if AODIRECTUV == 1
#define vAoUV vMainUV1
#elif AODIRECTUV == 2
#define vAoUV vMainUV2
#else
varying vec2 vAoUV;
#endif
#endif
#endif
#define sampleCube(s,c) textureCube(s,c)
#ifdef LODBASEDMICROSURFACE
#define sampleCubeLod(s,c,l) textureCubeLodEXT(s,c,l)
#endif

#ifdef IRRADIANCE
uniform samplerCube iradSampler0;
uniform samplerCube iradSampler1;
uniform samplerCube iradSampler2;
uniform samplerCube iradSampler3;
uniform samplerCube iradSampler4;
uniform samplerCube iradSampler5;
uniform samplerCube iradSampler6;
uniform samplerCube iradSampler7;
#endif

#ifdef RADIANCE
uniform samplerCube radSampler;
#endif
#ifdef ENVIRONMENTBRDF
uniform sampler2D environmentBrdfSampler;
#endif
#ifdef REFLECTIVITYROUGHNESS
#if REFLECTIVITYROUGHNESSDIRECTUV == 1
#define vReflectivityRoughnessUV vMainUV1
#elif REFLECTIVITYROUGHNESSDIRECTUV == 2
#define vReflectivityRoughnessUV vMainUV2
#else
varying vec2 vReflectivityRoughnessUV;
#endif
uniform sampler2D reflectivityRoughnessSampler;
#endif
#include<clipPlaneFragmentDeclaration>






vec3 fresnelSchlickRoughness(float cosTheta,vec3 F0,float roughness){
return F0+(max(vec3(1.0-roughness),F0)-F0)*pow(1.0-cosTheta,5.0);
}


vec3 toneMappingACES( vec3 color) {
const float A=2.51;
const float B=0.03;
const float C=2.43;
const float D=0.59;
const float E=0.14;
return (color*(A*color+B))/(color*(C*color+D)+E);
}
void main(void) {
#include<clipPlaneFragment>

vec3 viewDirectionW=normalize(vEyePosition.xyz-vPositionW);


#ifdef NORMAL
vec3 normalW=normalize(vNormalW)*-vEyePosition.w;
#else

vec3 normalW=normalize(cross(dFdx(vPositionW),dFdy(vPositionW)))*-vEyePosition.w;
#endif


vec3 surfaceAlbedo=vDiffuseColor.rgb;
float alpha=vDiffuseColor.a;
#ifdef DIFFUSE
vec4 baseDiffuseTexture=texture2D(diffuseSampler,vDiffuseUV);
#ifdef ALPHATEST
alpha*=baseDiffuseTexture.a;
#endif
surfaceAlbedo*=toLinearSpace(baseDiffuseTexture.rgb);
surfaceAlbedo*=vDiffuseInfos.y;
#endif


#ifdef VERTEXCOLOR
surfaceAlbedo*=vColor.rgb;
#ifdef VERTEXALPHA
alpha*=vColor.a;
#endif
#endif


#ifdef ALPHATEST
if (alpha<=0.4)discard;
#endif


float NdotVUnclamped=dot( normalW,viewDirectionW );
float NdotV=max(NdotVUnclamped,0.0);
float roughness=vReflectivity.a;
#ifdef REFLECTIVITYROUGHNESS
vec4 specularRoughness=texture2D(reflectivityRoughnessSampler,vReflectivityRoughnessUV);
roughness*=1.0-specularRoughness.a;
vec3 F0=specularRoughness.rgb;
#else
vec3 F0=vReflectivity.rgb;
#endif
vec3 F=fresnelSchlickRoughness( NdotV,F0,roughness);

#ifdef RADIANCE
vec3 radCoords=reflect(-1.*viewDirectionW,normalW);
#ifdef USEPARALLAXCORRECTION
vec3 localPos=vPositionW-vAABB[0].xyz;
vec3 intersect1=(vAABB[2].xyz-localPos)/radCoords;
vec3 intersect2=(vAABB[1].xyz-localPos)/radCoords;
vec3 intersect=max(intersect1,intersect2);
float dis=min(min(intersect.x,intersect.y),intersect.z);

intersect=vPositionW+radCoords*dis;
radCoords=intersect-vAABB[0].xyz;
#endif
#ifdef LODBASEDMICROSURFACE
#ifdef USERADIANCELODROUGHNESS
float radLod=log2(vLightProbeInfos.x*roughness*roughness);
#else
float radLod=0.0;
#endif
#ifdef USELODFALLOFF
radLod+=vLodFallOffFactor*vLodFallOff.z;
#endif
vec3 radiance=sampleCubeLod(radSampler,radCoords,radLod).rgb;
#else
vec3 radiance=sampleCube(radSampler,radCoords ).rgb;
#endif
radiance*=vLightProbeInfos.y;
#else
vec3 radiance=vec3(0.0);
#endif



#ifdef IRRADIANCE
vec3 irradiance=vec3(0.0);
#ifdef LODBASEDMICROSURFACE
#ifdef USELODFALLOFF
float lmLOD=vLodFallOffFactor*vLodFallOff.w;
#else
float lmLOD=0.;
#endif




irradiance+=sampleCubeLod( iradSampler0,normalW,lmLOD).rgb*vDynamicRatios[0];
irradiance+=sampleCubeLod( iradSampler1,normalW,lmLOD).rgb*vDynamicRatios[1];
irradiance+=sampleCubeLod( iradSampler4,normalW,lmLOD).rgb*vDynamicRatios[4];
irradiance+=sampleCubeLod( iradSampler5,normalW,lmLOD).rgb*vDynamicRatios[5];
if( vDynamicRatios[2]>=0.) {
irradiance+=sampleCubeLod( iradSampler2,normalW,lmLOD).rgb*vDynamicRatios[2];
irradiance+=sampleCubeLod( iradSampler3,normalW,lmLOD).rgb*vDynamicRatios[3];
irradiance+=sampleCubeLod( iradSampler6,normalW,lmLOD).rgb*vDynamicRatios[6];
irradiance+=sampleCubeLod( iradSampler7,normalW,lmLOD).rgb*vDynamicRatios[7];
}
#else
irradiance+=sampleCube( iradSampler0,normalW).rgb*vDynamicRatios[0];
irradiance+=sampleCube( iradSampler1,normalW).rgb*vDynamicRatios[1];
irradiance+=sampleCube( iradSampler4,normalW).rgb*vDynamicRatios[4];
irradiance+=sampleCube( iradSampler5,normalW).rgb*vDynamicRatios[5];
if( vDynamicRatios[2]>=0. ) {
irradiance+=sampleCube( iradSampler2,normalW).rgb*vDynamicRatios[2];
irradiance+=sampleCube( iradSampler3,normalW).rgb*vDynamicRatios[3];
irradiance+=sampleCube( iradSampler6,normalW).rgb*vDynamicRatios[6];
irradiance+=sampleCube( iradSampler7,normalW).rgb*vDynamicRatios[7];
}
#endif
irradiance=mix( vec3(1.0),irradiance,vLightProbeInfos.z);
#else

vec3 irradiance=vec3(0.6);
#endif


vec3 brdf=vec3(0.0);
#ifdef ENVIRONMENTBRDF
vec2 envBRDF=texture2D( environmentBrdfSampler,vec2(NdotV,roughness) ).xy;
brdf=F*envBRDF.x+envBRDF.y;
#endif


#ifdef AO
#if AODIRECTUV == 10
float ao=textureCube(aoSampler,normalW).r;
#else
float ao=toLinearSpace( texture2D(aoSampler,vAoUV).rgb).r;
#endif
#ifdef DYAO
ao=mix(1.0,ao,vAoInfos.y*vDynamicRatios[8] );

#else
ao=mix(1.0,ao,vAoInfos.y );
#endif
brdf*=environmentRadianceOcclusion(ao,NdotVUnclamped);
#else
float ao=1.0;
#endif


vec3 diffuse=surfaceAlbedo*irradiance*(1.0-F)*ao;
vec3 specular=brdf*radiance*ao;
vec3 final=diffuse+specular;

#if TONEMAPPINGMODE == 3
final=toneMappingACES( final );
#elif TONEMAPPINGMODE == 2
const float tonemappingCalibration=1.590579;
final=1.0-exp2(-tonemappingCalibration*final);
#elif TONEMAPPINGMODE == 1
final=final/(final+vec3(1.0));
#endif

final=toGammaSpace( final );
gl_FragColor=vec4( final,alpha );

}
