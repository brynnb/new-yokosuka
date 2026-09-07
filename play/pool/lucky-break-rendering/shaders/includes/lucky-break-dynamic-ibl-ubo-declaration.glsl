layout(std140,column_major) uniform;
uniform Material {
vec4 vDiffuseColor;
vec2 vDiffuseInfos;
mat4 diffuseMatrix;
vec2 vAoInfos;
mat4 aoMatrix;
vec2 vReflectivityRoughnessInfos;
mat4 reflectivityRoughnessMatrix;
vec4 vLodFallOff;
vec4 vLightProbeInfos;
vec4 vReflectivity;
mat4 vAABB;
float pointSize;
};
uniform Scene {
mat4 viewProjection;
mat4 view;
};
