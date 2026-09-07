uniform vec4 vDiffuseColor;

#ifdef DIFFUSE
uniform vec2 vDiffuseInfos;
#endif
#ifdef AO
uniform vec2 vAoInfos;
#endif
#ifdef REFLECTIVITYROUGHNESS
uniform vec2 vReflectivityRoughnessInfos;
#endif
#ifdef USELODFALLOFF
uniform vec4 vLodFallOff;
#endif
uniform vec4 vLightProbeInfos;
uniform vec4 vReflectivity;
#ifdef USEPARALLAXCORRECTION
uniform mat3 vAABB;
#endif
#ifdef POINTSIZE
uniform float pointSize;
#endif
