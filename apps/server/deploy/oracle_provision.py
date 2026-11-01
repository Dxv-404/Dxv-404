#!/usr/bin/env python3
"""Create (or find) the Train Poker table server on Oracle Cloud, using Always Free resources only.

Re-runnable: every resource is looked up by name first. Uses the API key in ~/.oci/config.
Shapes tried, in order, both inside the Always Free allowance:
  VM.Standard.A1.Flex with 1 OCPU / 6 GB (Arm), then VM.Standard.E2.1.Micro (1/8 OCPU, 1 GB).
"""
import base64, pathlib, sys, time
import oci

NAME = "train-poker"
HERE = pathlib.Path(__file__).parent
cfg = oci.config.from_file()
tenancy = cfg["tenancy"]
compartment = tenancy  # the root compartment
idn = oci.identity.IdentityClient(cfg)
net = oci.core.VirtualNetworkClient(cfg)
compute = oci.core.ComputeClient(cfg)
ad = idn.list_availability_domains(tenancy).data[0].name


def one(items, name):
    live = [x for x in items if x.display_name == name and getattr(x, "lifecycle_state", "") not in ("TERMINATED", "TERMINATING")]
    return live[0] if live else None


def network():
    vcn = one(net.list_vcns(compartment).data, NAME)
    if not vcn:
        vcn = net.create_vcn(oci.core.models.CreateVcnDetails(compartment_id=compartment, cidr_blocks=["10.20.0.0/16"], display_name=NAME, dns_label="trainpoker")).data
        oci.wait_until(net, net.get_vcn(vcn.id), "lifecycle_state", "AVAILABLE")
    igw = one(net.list_internet_gateways(compartment, vcn_id=vcn.id).data, NAME)
    if not igw:
        igw = net.create_internet_gateway(oci.core.models.CreateInternetGatewayDetails(compartment_id=compartment, vcn_id=vcn.id, is_enabled=True, display_name=NAME)).data
    net.update_route_table(vcn.default_route_table_id, oci.core.models.UpdateRouteTableDetails(route_rules=[
        oci.core.models.RouteRule(destination="0.0.0.0/0", destination_type="CIDR_BLOCK", network_entity_id=igw.id)]))
    tcp = lambda port: oci.core.models.IngressSecurityRule(protocol="6", source="0.0.0.0/0", tcp_options=oci.core.models.TcpOptions(destination_port_range=oci.core.models.PortRange(min=port, max=port)))
    net.update_security_list(vcn.default_security_list_id, oci.core.models.UpdateSecurityListDetails(
        ingress_security_rules=[tcp(22), tcp(80), tcp(443)],
        egress_security_rules=[oci.core.models.EgressSecurityRule(protocol="all", destination="0.0.0.0/0")]))
    subnet = one(net.list_subnets(compartment, vcn_id=vcn.id).data, NAME)
    if not subnet:
        subnet = net.create_subnet(oci.core.models.CreateSubnetDetails(compartment_id=compartment, vcn_id=vcn.id, cidr_block="10.20.1.0/24", display_name=NAME, dns_label="tables", prohibit_public_ip_on_vnic=False)).data
        oci.wait_until(net, net.get_subnet(subnet.id), "lifecycle_state", "AVAILABLE")
    return subnet


def image_for(shape):
    imgs = compute.list_images(compartment, operating_system="Canonical Ubuntu", operating_system_version="24.04", shape=shape, sort_by="TIMECREATED", sort_order="DESC").data
    imgs = [i for i in imgs if "Minimal" not in i.display_name] or imgs
    return imgs[0]


def launch(subnet):
    existing = one(compute.list_instances(compartment).data, NAME)
    if existing:
        print("instance exists:", existing.id, existing.lifecycle_state, existing.shape)
        return existing
    user_data = base64.b64encode((HERE / "oracle-cloud-init.sh").read_bytes()).decode()
    attempts = [("VM.Standard.A1.Flex", oci.core.models.LaunchInstanceShapeConfigDetails(ocpus=1, memory_in_gbs=6)), ("VM.Standard.E2.1.Micro", None)]
    for shape, shape_cfg in attempts:
        img = image_for(shape)
        print("trying", shape, "with", img.display_name)
        try:
            inst = compute.launch_instance(oci.core.models.LaunchInstanceDetails(
                compartment_id=compartment, availability_domain=ad, display_name=NAME, shape=shape, shape_config=shape_cfg,
                source_details=oci.core.models.InstanceSourceViaImageDetails(image_id=img.id, boot_volume_size_in_gbs=50),
                create_vnic_details=oci.core.models.CreateVnicDetails(subnet_id=subnet.id, assign_public_ip=True, display_name=NAME),
                metadata={"user_data": user_data},
                freeform_tags={"app": "train-poker", "tier": "always-free"},
            )).data
            return inst
        except oci.exceptions.ServiceError as e:
            print("  could not launch:", e.code, e.message[:160])
    sys.exit("No Always Free capacity right now; try again later.")


def public_ip(inst):
    oci.wait_until(compute, compute.get_instance(inst.id), "lifecycle_state", "RUNNING", max_wait_seconds=900)
    for att in compute.list_vnic_attachments(compartment, instance_id=inst.id).data:
        ip = net.get_vnic(att.vnic_id).data.public_ip
        if ip:
            return ip
    return None


if __name__ == "__main__":
    s = network()
    i = launch(s)
    ip = public_ip(i)
    print("RUNNING", i.shape, ip, "->", f"https://{ip.replace('.', '-')}.sslip.io" if ip else "")
