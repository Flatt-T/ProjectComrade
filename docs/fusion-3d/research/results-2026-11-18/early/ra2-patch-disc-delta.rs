// Reconstruct only the identified 1.006 RA2.MIX entry and check all independent entry measurements.
mod codec;
mod error {#[derive(Debug)] pub enum RtpError {ApplyError {filename: String,detail:String}}}
mod apply;
fn checksums(data:&[u8])->(u32,u32) {
    let (mut a,mut b)=(0u32,0u32);
    for c in data {
        let left=a^(*c as u32); a=((left<<8)|(left>>23))&0x7fffffff;
        let right=b^(*c as u32); b=((right<<8)|(right>>22))&0x3fffffff;
    }
    (a,b)
}
fn expected(patch:&[u8],offset:usize)->(usize,(u32,u32)){
    let read=|i:usize|u32::from_le_bytes(patch[offset+i..offset+i+4].try_into().unwrap());
    (read(16) as usize,(read(26)&0x7fffffff,read(30)&0x3fffffff))
}
fn main(){
    let args:Vec<_>=std::env::args().collect();
    let original=std::fs::read(&args[1]).unwrap();
    let patch=std::fs::read(&args[2]).unwrap();
    assert_eq!((original.len(),checksums(&original)),expected(&patch,2372661));
    let ops=codec::decompress(&patch,2372763,570265,936760).unwrap();
    assert_eq!(ops.len(),936760);
    let (size,sums)=expected(&patch,2372712);
    let result=apply::apply(&original,&ops,size,1).unwrap();
    assert_eq!((result.len(),checksums(&result)),(size,sums));
    std::fs::write(&args[3],result).unwrap();
}
